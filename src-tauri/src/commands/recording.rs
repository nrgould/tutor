use base64::{engine::general_purpose::STANDARD, Engine};
use image::imageops::FilterType;
use parking_lot::Mutex;
use rusqlite::Row;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use uuid::Uuid;
use xcap::Monitor;

use crate::db::with_connection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSession {
    pub id: String,
    pub name: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub interval_seconds: i32,
    pub screenshot_count: i32,
    pub notes: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screenshot {
    pub id: String,
    pub session_id: String,
    pub image_data: String,
    pub thumbnail_data: Option<String>,
    pub captured_at: String,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct RecordingStatus {
    pub is_recording: bool,
    pub session_id: Option<String>,
    pub screenshot_count: i32,
    pub started_at: Option<String>,
}

pub struct RecordingState {
    pub is_recording: bool,
    pub session_id: Option<String>,
    pub screenshot_count: i32,
    pub started_at: Option<String>,
    pub stop_sender: Option<mpsc::Sender<()>>,
}

impl Default for RecordingState {
    fn default() -> Self {
        Self {
            is_recording: false,
            session_id: None,
            screenshot_count: 0,
            started_at: None,
            stop_sender: None,
        }
    }
}

pub type RecordingStateHandle = Arc<Mutex<RecordingState>>;

fn row_to_session(row: &Row) -> rusqlite::Result<RecordingSession> {
    Ok(RecordingSession {
        id: row.get(0)?,
        name: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        interval_seconds: row.get(4)?,
        screenshot_count: row.get(5)?,
        notes: row.get(6)?,
        summary: row.get(7)?,
    })
}

fn row_to_screenshot(row: &Row, include_full: bool) -> rusqlite::Result<Screenshot> {
    let image_data: String = if include_full {
        row.get(2)?
    } else {
        String::new()
    };
    Ok(Screenshot {
        id: row.get(0)?,
        session_id: row.get(1)?,
        image_data,
        thumbnail_data: row.get(3)?,
        captured_at: row.get(4)?,
        app_name: row.get(5)?,
        window_title: row.get(6)?,
        notes: row.get(7)?,
    })
}

fn capture_screenshot_sync() -> Result<(String, String), String> {
    let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

    let monitor = monitors
        .into_iter()
        .next()
        .ok_or_else(|| "No monitors found".to_string())?;

    let image = monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture screen: {}", e))?;

    // Create full-size image
    let mut full_buffer = Cursor::new(Vec::new());
    image
        .write_to(&mut full_buffer, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode image: {}", e))?;
    let full_base64 = STANDARD.encode(full_buffer.into_inner());

    // Create thumbnail (200px width, proportional height)
    let thumb_width = 200u32;
    let thumb_height = (image.height() as f32 * (thumb_width as f32 / image.width() as f32)) as u32;
    let thumbnail = image::imageops::resize(&image, thumb_width, thumb_height, FilterType::Triangle);

    let mut thumb_buffer = Cursor::new(Vec::new());
    thumbnail
        .write_to(&mut thumb_buffer, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode thumbnail: {}", e))?;
    let thumb_base64 = STANDARD.encode(thumb_buffer.into_inner());

    Ok((full_base64, thumb_base64))
}

#[tauri::command]
pub async fn start_recording(
    app: AppHandle,
    state: State<'_, RecordingStateHandle>,
    interval_seconds: Option<i32>,
) -> Result<RecordingSession, String> {
    let interval = interval_seconds.unwrap_or(30);

    // Check if already recording
    {
        let state_guard = state.lock();
        if state_guard.is_recording {
            return Err("Already recording".to_string());
        }
    }

    // Create session in database
    let session_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let session_id_clone = session_id.clone();
    let now_clone = now.clone();
    let interval_str = interval.to_string();

    with_connection(|conn| {
        conn.execute(
            "INSERT INTO recording_sessions (id, started_at, interval_seconds) VALUES (?1, ?2, ?3)",
            [&session_id_clone, &now_clone, &interval_str],
        )?;
        Ok(())
    })?;

    let session = RecordingSession {
        id: session_id.clone(),
        name: None,
        started_at: now.clone(),
        ended_at: None,
        interval_seconds: interval,
        screenshot_count: 0,
        notes: None,
        summary: None,
    };

    // Set up stop channel
    let (stop_tx, mut stop_rx) = mpsc::channel::<()>(1);

    // Update state
    {
        let mut state_guard = state.lock();
        state_guard.is_recording = true;
        state_guard.session_id = Some(session_id.clone());
        state_guard.screenshot_count = 0;
        state_guard.started_at = Some(now.clone());
        state_guard.stop_sender = Some(stop_tx);
    }

    // Emit initial status
    let _ = app.emit("recording-status", RecordingStatus {
        is_recording: true,
        session_id: Some(session_id.clone()),
        screenshot_count: 0,
        started_at: Some(now.clone()),
    });

    // Spawn background task for periodic screenshots
    let app_handle = app.clone();
    let state_clone = state.inner().clone();
    let session_id_clone = session_id.clone();

    tokio::spawn(async move {
        let interval_duration = tokio::time::Duration::from_secs(interval as u64);

        // Take first screenshot immediately
        if let Err(e) = take_and_save_screenshot(&app_handle, &state_clone, &session_id_clone).await {
            eprintln!("Failed to take screenshot: {}", e);
        }

        loop {
            tokio::select! {
                _ = tokio::time::sleep(interval_duration) => {
                    // Check if still recording
                    let still_recording = {
                        let state_guard = state_clone.lock();
                        state_guard.is_recording
                    };

                    if !still_recording {
                        break;
                    }

                    if let Err(e) = take_and_save_screenshot(&app_handle, &state_clone, &session_id_clone).await {
                        eprintln!("Failed to take screenshot: {}", e);
                    }
                }
                _ = stop_rx.recv() => {
                    break;
                }
            }
        }
    });

    Ok(session)
}

async fn take_and_save_screenshot(
    app: &AppHandle,
    state: &RecordingStateHandle,
    session_id: &str,
) -> Result<(), String> {
    // Capture screenshot in blocking thread
    let (full_image, thumbnail) = tokio::task::spawn_blocking(capture_screenshot_sync)
        .await
        .map_err(|e| format!("Task failed: {}", e))??;

    let screenshot_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let session_id_owned = session_id.to_string();
    let thumbnail_clone = thumbnail.clone();

    // Save to database
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO screenshots (id, session_id, image_data, thumbnail_data, captured_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            [&screenshot_id, &session_id_owned, &full_image, &thumbnail, &now],
        )?;

        // Update session screenshot count
        conn.execute(
            "UPDATE recording_sessions SET screenshot_count = screenshot_count + 1 WHERE id = ?1",
            [&session_id_owned],
        )?;

        Ok(())
    })?;

    // Update state and emit event
    let count = {
        let mut state_guard = state.lock();
        state_guard.screenshot_count += 1;
        state_guard.screenshot_count
    };

    let _ = app.emit("screenshot-captured", Screenshot {
        id: screenshot_id,
        session_id: session_id.to_string(),
        image_data: String::new(), // Don't send full image in event
        thumbnail_data: Some(thumbnail_clone),
        captured_at: now.clone(),
        app_name: None,
        window_title: None,
        notes: None,
    });

    // Update recording status
    let status = {
        let state_guard = state.lock();
        RecordingStatus {
            is_recording: state_guard.is_recording,
            session_id: state_guard.session_id.clone(),
            screenshot_count: count,
            started_at: state_guard.started_at.clone(),
        }
    };
    let _ = app.emit("recording-status", status);

    Ok(())
}

#[tauri::command]
pub async fn stop_recording(
    app: AppHandle,
    state: State<'_, RecordingStateHandle>,
) -> Result<RecordingSession, String> {
    // Extract what we need from state, then release the lock before awaiting
    let (session_id, stop_sender) = {
        let mut state_guard = state.lock();
        if !state_guard.is_recording {
            return Err("Not recording".to_string());
        }

        let sender = state_guard.stop_sender.take();
        state_guard.is_recording = false;
        (state_guard.session_id.take(), sender)
    };

    // Send stop signal outside the lock
    if let Some(sender) = stop_sender {
        let _ = sender.send(()).await;
    }

    let session_id = session_id.ok_or_else(|| "No session ID".to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // Update session in database and get the session
    let session = with_connection(|conn| {
        conn.execute(
            "UPDATE recording_sessions SET ended_at = ?1 WHERE id = ?2",
            [&now, &session_id],
        )?;

        conn.query_row(
            "SELECT id, name, started_at, ended_at, interval_seconds, screenshot_count, notes, summary FROM recording_sessions WHERE id = ?1",
            [&session_id],
            row_to_session,
        )
    })?;

    // Emit status update
    let _ = app.emit("recording-status", RecordingStatus {
        is_recording: false,
        session_id: None,
        screenshot_count: 0,
        started_at: None,
    });

    Ok(session)
}

#[tauri::command]
pub async fn get_recording_status(
    state: State<'_, RecordingStateHandle>,
) -> Result<RecordingStatus, String> {
    let state_guard = state.lock();
    Ok(RecordingStatus {
        is_recording: state_guard.is_recording,
        session_id: state_guard.session_id.clone(),
        screenshot_count: state_guard.screenshot_count,
        started_at: state_guard.started_at.clone(),
    })
}

#[tauri::command]
pub async fn get_recording_sessions(limit: Option<i32>) -> Result<Vec<RecordingSession>, String> {
    let limit = limit.unwrap_or(50);

    with_connection(move |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, started_at, ended_at, interval_seconds, screenshot_count, notes, summary
             FROM recording_sessions
             ORDER BY started_at DESC
             LIMIT ?1",
        )?;

        let sessions = stmt
            .query_map([limit], row_to_session)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(sessions)
    })
}

#[tauri::command]
pub async fn get_session_screenshots(
    session_id: String,
    include_full_image: Option<bool>,
) -> Result<Vec<Screenshot>, String> {
    let include_full = include_full_image.unwrap_or(false);

    with_connection(move |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, session_id, image_data, thumbnail_data, captured_at, app_name, window_title, notes
             FROM screenshots
             WHERE session_id = ?1
             ORDER BY captured_at ASC",
        )?;

        let screenshots = stmt
            .query_map([&session_id], |row| row_to_screenshot(row, include_full))?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(screenshots)
    })
}

#[tauri::command]
pub async fn get_screenshot(screenshot_id: String) -> Result<Screenshot, String> {
    with_connection(|conn| {
        conn.query_row(
            "SELECT id, session_id, image_data, thumbnail_data, captured_at, app_name, window_title, notes
             FROM screenshots
             WHERE id = ?1",
            [&screenshot_id],
            |row| row_to_screenshot(row, true),
        )
    })
}

#[tauri::command]
pub async fn update_session(
    session_id: String,
    name: Option<String>,
    notes: Option<String>,
) -> Result<RecordingSession, String> {
    with_connection(|conn| {
        if let Some(ref name) = name {
            conn.execute(
                "UPDATE recording_sessions SET name = ?1 WHERE id = ?2",
                [name, &session_id],
            )?;
        }

        if let Some(ref notes) = notes {
            conn.execute(
                "UPDATE recording_sessions SET notes = ?1 WHERE id = ?2",
                [notes, &session_id],
            )?;
        }

        conn.query_row(
            "SELECT id, name, started_at, ended_at, interval_seconds, screenshot_count, notes, summary FROM recording_sessions WHERE id = ?1",
            [&session_id],
            row_to_session,
        )
    })
}

#[tauri::command]
pub async fn delete_session(session_id: String) -> Result<(), String> {
    with_connection(|conn| {
        // Delete screenshots first
        conn.execute(
            "DELETE FROM screenshots WHERE session_id = ?1",
            [&session_id],
        )?;

        // Delete session
        conn.execute(
            "DELETE FROM recording_sessions WHERE id = ?1",
            [&session_id],
        )?;

        Ok(())
    })
}
