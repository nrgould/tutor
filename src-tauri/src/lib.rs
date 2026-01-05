mod commands;
mod db;
mod utils;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use commands::capture::{PendingScreenshot, PendingScreenshotHandle, RegionCaptureResult, RegionCaptureResultHandle};
use commands::recording::{RecordingState, RecordingStateHandle};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Initialize database
            db::init(app.handle())?;

            // Initialize recording state
            let recording_state: RecordingStateHandle = Arc::new(Mutex::new(RecordingState::default()));
            app.manage(recording_state);

            // Initialize pending screenshot state for region selector
            let pending_screenshot: PendingScreenshotHandle = Arc::new(PendingScreenshot::default());
            app.manage(pending_screenshot);

            // Initialize region capture result state
            let region_capture_result: RegionCaptureResultHandle = Arc::new(RegionCaptureResult::default());
            app.manage(region_capture_result);

            // Build tray menu
            let show_item = MenuItemBuilder::with_id("show", "Show Eigen").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&settings_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Load tray icon
            let icon = Image::from_bytes(include_bytes!("../icons/icon.png"))?;

            // Build system tray
            let app_handle = app.handle().clone();
            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Eigen - AI Study Companion")
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "settings" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                // Navigate to settings - emit event to frontend
                                let _ = window.emit("navigate", "/settings");
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        toggle_window(app);
                    }
                })
                .build(app)?;

            // Register global shortcut (Ctrl+Shift+Space)
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

            // Unregister first in case it's stuck from a previous crash
            let _ = app.global_shortcut().unregister(shortcut);

            let app_handle_shortcut = app.handle().clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                toggle_window(&app_handle_shortcut);
            })?;

            // Try to register, ignore error if already registered
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Could not register hotkey: {}", e);
            }

            // Show the main window on startup
            if let Some(window) = app.get_webview_window("main") {
                // On Windows, set the window to be transparent
                #[cfg(target_os = "windows")]
                {
                    use tauri::window::Effect;
                    // Try to apply blur effect for glass look
                    let _ = window.set_effects(Some(tauri::window::EffectsConfig {
                        effects: vec![Effect::Blur],
                        state: None,
                        radius: None,
                        color: None,
                    }));
                }

                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Capture commands
            commands::capture_screen,
            commands::capture_region,
            commands::open_region_selector,
            commands::get_pending_screenshot,
            commands::get_region_capture_result,
            commands::close_region_selector,
            commands::close_region_selector_with_result,
            commands::region_selected,
            commands::get_screen_context,
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
            commands::save_fact,
            commands::get_facts,
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
