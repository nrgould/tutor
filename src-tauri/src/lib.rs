mod commands;
mod db;
mod utils;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Listener,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
use serde_json;

use commands::capture::{PendingScreenshot, PendingScreenshotHandle, RegionCaptureResult, RegionCaptureResultHandle};
use commands::recording::{RecordingState, RecordingStateHandle};
use tauri::WindowEvent;

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            // Position window near cursor/tray before showing
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

async fn toggle_recording(app: &tauri::AppHandle) -> Result<(), String> {
    // Get state from app
    let state = app.state::<RecordingStateHandle>();
    
    let is_recording = {
        let state_guard = state.lock();
        state_guard.is_recording
    };
    
    eprintln!("Toggle recording called. Currently recording: {}", is_recording);
    
    if is_recording {
        eprintln!("Stopping recording...");
        commands::recording::stop_recording(app.clone(), state).await?;
        eprintln!("Recording stopped");
    } else {
        eprintln!("Starting recording...");
        // Use 1 second interval to match frontend expectations
        let result = commands::recording::start_recording(app.clone(), state, Some(1)).await?;
        eprintln!("Recording started: {:?}", result.id);
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_liquid_glass::init())
        .setup(|app| {
            // Initialize database
            db::init(app.handle())?;

            // Initialize recording state
            let recording_state: RecordingStateHandle = Arc::new(Mutex::new(RecordingState::default()));
            app.manage(recording_state.clone());

            // Initialize pending screenshot state for region selector
            let pending_screenshot: PendingScreenshotHandle = Arc::new(PendingScreenshot::default());
            app.manage(pending_screenshot);

            // Initialize region capture result state
            let region_capture_result: RegionCaptureResultHandle = Arc::new(RegionCaptureResult::default());
            app.manage(region_capture_result);

            // Check screen recording permission on startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Small delay to ensure app is fully initialized
                tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
                
                match commands::capture::check_screen_recording_permission().await {
                    Ok(has_permission) => {
                        if !has_permission {
                            eprintln!("Screen recording permission not granted - emitting event");
                            let _ = app_handle.emit("screen-recording-permission-denied", ());
                        } else {
                            eprintln!("Screen recording permission granted");
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to check screen recording permission: {}", e);
                        let _ = app_handle.emit("screen-recording-permission-denied", ());
                    }
                }
            });

            // Build tray menu
            let show_item = MenuItemBuilder::with_id("show", "Show Eigen").build(app)?;
            let recording_item = MenuItemBuilder::with_id("recording", "Start Recording").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&recording_item)
                .separator()
                .item(&settings_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Load tray icon
            let icon = match Image::from_bytes(include_bytes!("../icons/icon.png")) {
                Ok(icon) => icon,
                Err(e) => {
                    eprintln!("Error loading tray icon: {}", e);
                    return Err(e.into());
                }
            };

            // Build system tray
            let recording_state_clone = recording_state.clone();
            let show_item_menu = show_item.clone();
            let show_item_tray = show_item.clone();
            let show_item_startup = show_item.clone();
            let recording_item_menu = recording_item.clone();
            let tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Eigen - AI Study Companion")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            toggle_window(app);
                            // Update menu text after toggling
                            if let Some(window) = app.get_webview_window("main") {
                                let is_visible = window.is_visible().unwrap_or(false);
                                let text = if is_visible { "Hide Eigen" } else { "Show Eigen" };
                                let _ = show_item_menu.set_text(text);
                            }
                        }
                        "recording" => {
                            eprintln!("Recording menu item clicked");
                            let app_handle = app.clone();
                            let recording_item = recording_item_menu.clone();
                            let state_clone = recording_state_clone.clone();
                            
                            // Check if we're starting or stopping
                            let is_currently_recording = {
                                let state_guard = state_clone.lock();
                                state_guard.is_recording
                            };
                            
                            eprintln!("Current recording state: {}", is_currently_recording);
                            
                            // If starting recording, show the window first and ensure it's focused
                            if !is_currently_recording {
                                eprintln!("Showing window for recording...");
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    // Emit event to frontend to open chat interface
                                    let _ = window.emit("recording-started", ());
                                    eprintln!("Window shown and event emitted");
                                } else {
                                    eprintln!("Warning: main window not found!");
                                }
                            }
                            
                            // Toggle recording using Tauri's async runtime
                            let app_handle_clone = app_handle.clone();
                            let recording_item_clone = recording_item.clone();
                            tauri::async_runtime::spawn(async move {
                                eprintln!("Spawning recording task...");
                                match toggle_recording(&app_handle_clone).await {
                                    Ok(_) => {
                                        eprintln!("Toggle recording succeeded");
                                        // Update menu text based on new state
                                        let is_recording = {
                                            let state_guard = state_clone.lock();
                                            state_guard.is_recording
                                        };
                                        let text = if is_recording { "Stop Recording" } else { "Start Recording" };
                                        let _ = recording_item_clone.set_text(text);
                                        eprintln!("Menu text updated to: {}", text);
                                    }
                                    Err(e) => {
                                        eprintln!("Failed to toggle recording: {}", e);
                                    }
                                }
                            });
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                // Navigate to settings - emit event to frontend
                                let _ = window.emit("navigate", "/settings");
                                // Update menu text after showing
                                let _ = show_item_menu.set_text("Hide Eigen");
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        toggle_window(app);
                        // Update menu text after toggling via tray icon click
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            let text = if is_visible { "Hide Eigen" } else { "Show Eigen" };
                            let _ = show_item_tray.set_text(text);
                        }
                    }
                })
                .build(app)?;
            
            // Tray icon is managed by Tauri internally and will persist
            // We keep the variable to ensure it's not dropped during setup
            let _tray_handle = tray;
            
            eprintln!("Tray icon created successfully");

            // Register global shortcut (Ctrl+Shift+Space)
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

            // Unregister first in case it's stuck from a previous crash
            let _ = app.global_shortcut().unregister(shortcut);

            let app_handle_shortcut = app.handle().clone();
            let show_item_shortcut = show_item.clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                // Only toggle on key press, not release
                use tauri_plugin_global_shortcut::ShortcutState;
                if event.state() != ShortcutState::Pressed {
                    return;
                }

                toggle_window(&app_handle_shortcut);
                // Update menu text after toggling via global shortcut
                if let Some(window) = app_handle_shortcut.get_webview_window("main") {
                    let is_visible: bool = window.is_visible().unwrap_or(false);
                    let text = if is_visible { "Hide Eigen" } else { "Show Eigen" };
                    let _ = show_item_shortcut.set_text(text);
                }
            })?;

            // Try to register, ignore error if already registered
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Could not register hotkey: {}", e);
            }

            // Helper function to set window background transparent on macOS
            #[cfg(target_os = "macos")]
            fn set_window_transparent(window: &tauri::WebviewWindow) {
                if let Ok(ns_window) = window.ns_window() {
                    unsafe {
                        use cocoa::base::id;
                        use objc::{msg_send, sel, sel_impl, runtime::Class};

                        let ns_window: id = ns_window as id;
                        // Get NSColor class and call clearColor
                        if let Some(ns_color_class) = Class::get("NSColor") {
                            let clear_color: id = msg_send![ns_color_class, clearColor];
                            // Set the window background to transparent
                            let _: () = msg_send![ns_window, setBackgroundColor: clear_color];
                            // Ensure the window is not opaque (required for transparency to work properly)
                            let _: () = msg_send![ns_window, setOpaque: cocoa::base::NO];
                            // Remove window shadow - this removes the blue border artifact
                            let _: () = msg_send![ns_window, setHasShadow: cocoa::base::NO];
                            // Make transparent areas click-through (forward events to apps behind)
                            let _: () = msg_send![ns_window, setIgnoresMouseEvents: cocoa::base::NO];
                        }
                    }
                }
            }

            // Show the main window on startup
            if let Some(window) = app.get_webview_window("main") {
                #[cfg(target_os = "macos")]
                {
                    set_window_transparent(&window);
                }
                let _ = window.show();
                #[cfg(target_os = "macos")]
                {
                    // Set again after showing to ensure it takes effect
                    set_window_transparent(&window);
                }
                let _ = window.set_focus();
                // Update menu text to reflect that window is now visible
                let _ = show_item_startup.set_text("Hide Eigen");
            }

            // Update recording menu text on startup
            let is_recording = {
                let state_guard = recording_state.lock();
                state_guard.is_recording
            };
            let text = if is_recording { "Stop Recording" } else { "Start Recording" };
            let _ = recording_item.set_text(text);

            // Listen to recording status events to update menu text
            let recording_item_status = recording_item.clone();
            let _id = app.listen("recording-status", move |event: tauri::Event| {
                // Parse the event payload
                let payload_str = event.payload();
                if let Ok(status) = serde_json::from_str::<serde_json::Value>(payload_str) {
                    if let Some(is_recording) = status.get("is_recording").and_then(|v| v.as_bool()) {
                        let text = if is_recording { "Stop Recording" } else { "Start Recording" };
                        let _ = recording_item_status.set_text(text);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Prevent app from exiting when window is closed
            // Only exit when Quit is explicitly selected from menu
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Capture commands
            commands::capture_screen,
            commands::capture_screen_silent,
            commands::capture_region,
            commands::open_region_selector,
            commands::get_pending_screenshot,
            commands::get_region_capture_result,
            commands::close_region_selector,
            commands::close_region_selector_with_result,
            commands::region_selected,
            commands::get_screen_context,
            commands::check_screen_recording_permission,
            commands::open_screen_recording_settings,
            // Database commands
            commands::create_conversation,
            commands::get_conversation,
            commands::get_conversations,
            commands::update_conversation,
            commands::save_message,
            commands::get_messages,
            commands::get_setting,
            commands::set_setting,
            // Import commands
            commands::import_conversation,
            commands::import_message,
            // Memory commands
            commands::save_memory,
            commands::get_memories,
            commands::get_memories_with_embeddings,
            commands::update_memory_access,
            commands::save_topic,
            commands::get_topics,
            commands::update_topic_mastery,
            commands::update_topic_parent,
            commands::delete_topic,
            commands::reassign_topic_parent,
            commands::save_fact,
            commands::get_facts,
            commands::reset_all_learning_data,
            // Review item commands
            commands::save_review_item,
            commands::get_review_items,
            commands::get_due_review_items,
            commands::update_review_item_schedule,
            commands::delete_review_item,
            commands::get_review_stats,
            // Recording commands
            commands::start_recording,
            commands::stop_recording,
            commands::get_recording_status,
            commands::get_recording_sessions,
            commands::get_session_screenshots,
            commands::get_screenshot,
            commands::update_session,
            commands::delete_session,
            // Notes commands
            commands::create_note,
            commands::get_note,
            commands::get_notes,
            commands::update_note,
            commands::delete_note,
            commands::toggle_note_pin,
            commands::search_notes,
            // Courses commands
            commands::create_course,
            commands::get_courses,
            commands::get_course,
            commands::update_course,
            commands::delete_course,
            commands::add_course_material,
            commands::get_course_materials,
            commands::toggle_material_completed,
            commands::delete_material,
            commands::get_upcoming_assignments,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
