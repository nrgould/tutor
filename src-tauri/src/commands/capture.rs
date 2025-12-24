use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::io::Cursor;
use xcap::Monitor;

#[derive(Debug, Clone, Serialize)]
pub struct ScreenContext {
    pub app_name: Option<String>,
    pub window_title: Option<String>,
}

#[tauri::command]
pub async fn capture_screen() -> Result<String, String> {
    // Run the capture in a blocking thread since xcap is sync
    tokio::task::spawn_blocking(|| {
        // Get the primary monitor
        let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

        let monitor = monitors
            .into_iter()
            .next()
            .ok_or_else(|| "No monitors found".to_string())?;

        // Capture the screen
        let image = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture screen: {}", e))?;

        // Convert to PNG and base64 encode
        let mut buffer = Cursor::new(Vec::new());
        image
            .write_to(&mut buffer, image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode image: {}", e))?;

        let base64_image = STANDARD.encode(buffer.into_inner());

        Ok(base64_image)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_screen_context() -> Result<ScreenContext, String> {
    // For now, return empty context
    // In the future, we can add active window detection
    Ok(ScreenContext {
        app_name: None,
        window_title: None,
    })
}
