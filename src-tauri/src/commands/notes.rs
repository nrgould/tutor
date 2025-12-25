use crate::db::with_connection;
use rusqlite::Row;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: Option<String>,
    pub content: String,
    pub summary: Option<String>,
    pub session_id: Option<String>,
    pub topic_id: Option<String>,
    pub is_pinned: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateNoteInput {
    pub title: Option<String>,
    pub content: String,
    pub session_id: Option<String>,
    pub topic_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateNoteInput {
    pub title: Option<String>,
    pub content: Option<String>,
    pub summary: Option<String>,
    pub topic_id: Option<String>,
    pub is_pinned: Option<bool>,
}

fn row_to_note(row: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        summary: row.get(3)?,
        session_id: row.get(4)?,
        topic_id: row.get(5)?,
        is_pinned: row.get::<_, i32>(6)? != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

#[tauri::command]
pub async fn create_note(input: CreateNoteInput) -> Result<Note, String> {
    let note_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    let note = Note {
        id: note_id.clone(),
        title: input.title.clone(),
        content: input.content.clone(),
        summary: None,
        session_id: input.session_id.clone(),
        topic_id: input.topic_id.clone(),
        is_pinned: false,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    with_connection(|conn| {
        conn.execute(
            "INSERT INTO notes (id, title, content, session_id, topic_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                &note_id,
                &input.title,
                &input.content,
                &input.session_id,
                &input.topic_id,
                &now,
                &now,
            ],
        )?;
        Ok(())
    })?;

    Ok(note)
}

#[tauri::command]
pub async fn get_note(note_id: String) -> Result<Note, String> {
    with_connection(|conn| {
        conn.query_row(
            "SELECT id, title, content, summary, session_id, topic_id, is_pinned, created_at, updated_at FROM notes WHERE id = ?1",
            [&note_id],
            row_to_note,
        )
    })
}

#[tauri::command]
pub async fn get_notes(
    limit: Option<i32>,
    session_id: Option<String>,
    topic_id: Option<String>,
    pinned_only: Option<bool>,
) -> Result<Vec<Note>, String> {
    let limit = limit.unwrap_or(100);

    with_connection(move |conn| {
        let mut query = String::from(
            "SELECT id, title, content, summary, session_id, topic_id, is_pinned, created_at, updated_at FROM notes WHERE 1=1"
        );
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![];

        if let Some(ref sid) = session_id {
            query.push_str(" AND session_id = ?");
            params.push(Box::new(sid.clone()));
        }

        if let Some(ref tid) = topic_id {
            query.push_str(" AND topic_id = ?");
            params.push(Box::new(tid.clone()));
        }

        if pinned_only.unwrap_or(false) {
            query.push_str(" AND is_pinned = 1");
        }

        query.push_str(" ORDER BY is_pinned DESC, updated_at DESC LIMIT ?");
        params.push(Box::new(limit));

        let mut stmt = conn.prepare(&query)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let notes = stmt
            .query_map(param_refs.as_slice(), row_to_note)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(notes)
    })
}

#[tauri::command]
pub async fn update_note(note_id: String, input: UpdateNoteInput) -> Result<Note, String> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    with_connection(|conn| {
        let mut update_parts = vec!["updated_at = ?1".to_string()];
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now.clone())];
        let mut param_idx = 2;

        if let Some(ref title) = input.title {
            update_parts.push(format!("title = ?{}", param_idx));
            params.push(Box::new(title.clone()));
            param_idx += 1;
        }
        if let Some(ref content) = input.content {
            update_parts.push(format!("content = ?{}", param_idx));
            params.push(Box::new(content.clone()));
            param_idx += 1;
        }
        if let Some(ref summary) = input.summary {
            update_parts.push(format!("summary = ?{}", param_idx));
            params.push(Box::new(summary.clone()));
            param_idx += 1;
        }
        if let Some(ref topic_id) = input.topic_id {
            update_parts.push(format!("topic_id = ?{}", param_idx));
            params.push(Box::new(topic_id.clone()));
            param_idx += 1;
        }
        if let Some(is_pinned) = input.is_pinned {
            update_parts.push(format!("is_pinned = ?{}", param_idx));
            params.push(Box::new(if is_pinned { 1i32 } else { 0i32 }));
            param_idx += 1;
        }

        let query = format!(
            "UPDATE notes SET {} WHERE id = ?{}",
            update_parts.join(", "),
            param_idx
        );
        params.push(Box::new(note_id.clone()));

        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        conn.execute(&query, param_refs.as_slice())?;

        conn.query_row(
            "SELECT id, title, content, summary, session_id, topic_id, is_pinned, created_at, updated_at FROM notes WHERE id = ?1",
            [&note_id],
            row_to_note,
        )
    })
}

#[tauri::command]
pub async fn delete_note(note_id: String) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute("DELETE FROM notes WHERE id = ?1", [&note_id])?;
        Ok(())
    })
}

#[tauri::command]
pub async fn toggle_note_pin(note_id: String) -> Result<Note, String> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();

    with_connection(|conn| {
        conn.execute(
            "UPDATE notes SET is_pinned = NOT is_pinned, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![&now, &note_id],
        )?;

        conn.query_row(
            "SELECT id, title, content, summary, session_id, topic_id, is_pinned, created_at, updated_at FROM notes WHERE id = ?1",
            [&note_id],
            row_to_note,
        )
    })
}

#[tauri::command]
pub async fn search_notes(query: String, limit: Option<i32>) -> Result<Vec<Note>, String> {
    let limit = limit.unwrap_or(50);
    let search_term = format!("%{}%", query);

    with_connection(move |conn| {
        let mut stmt = conn.prepare(
            "SELECT id, title, content, summary, session_id, topic_id, is_pinned, created_at, updated_at
             FROM notes
             WHERE title LIKE ?1 OR content LIKE ?1 OR summary LIKE ?1
             ORDER BY is_pinned DESC, updated_at DESC
             LIMIT ?2",
        )?;

        let notes = stmt
            .query_map(rusqlite::params![&search_term, limit], row_to_note)?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(notes)
    })
}
