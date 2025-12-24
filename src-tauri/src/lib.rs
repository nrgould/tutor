mod commands;
mod db;
mod utils;

use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Initialize database
            db::init(app.handle())?;

            // Register global shortcut (Ctrl+Shift+Space)
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

            // Unregister first in case it's stuck from a previous crash
            let _ = app.global_shortcut().unregister(shortcut);

            let app_handle = app.handle().clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, _event| {
                if let Some(window) = app_handle.get_webview_window("overlay") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })?;

            // Try to register, ignore error if already registered
            if let Err(e) = app.global_shortcut().register(shortcut) {
                eprintln!("Warning: Could not register hotkey: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Capture commands
            commands::capture_screen,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
