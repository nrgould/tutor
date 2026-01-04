use base64::{engine::general_purpose::STANDARD, Engine};
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Window};
use xcap::Monitor;

#[derive(Debug, Clone, Serialize)]
pub struct ScreenContext {
    pub app_name: Option<String>,
    pub window_title: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RegionBounds {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn capture_screen(window: Window) -> Result<String, String> {
    // Hide the window before capturing
    window.hide().map_err(|e| format!("Failed to hide window: {}", e))?;

    // Small delay to ensure window is hidden
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Run the capture in a blocking thread since xcap is sync
    let result = tokio::task::spawn_blocking(|| {
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

        Ok::<String, String>(base64_image)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    // Show the window again
    window.show().map_err(|e| format!("Failed to show window: {}", e))?;

    result
}

#[tauri::command]
pub async fn capture_region(window: Window, bounds: RegionBounds) -> Result<String, String> {
    // Hide the window before capturing
    window.hide().map_err(|e| format!("Failed to hide window: {}", e))?;

    // Small delay to ensure window is hidden
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Run the capture in a blocking thread since xcap is sync
    let result = tokio::task::spawn_blocking(move || {
        // Get the primary monitor
        let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

        let monitor = monitors
            .into_iter()
            .next()
            .ok_or_else(|| "No monitors found".to_string())?;

        // Capture the full screen
        let full_image = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture screen: {}", e))?;

        // Crop to the selected region
        let cropped = full_image.view(
            bounds.x.min(full_image.width().saturating_sub(1)),
            bounds.y.min(full_image.height().saturating_sub(1)),
            bounds.width.min(full_image.width().saturating_sub(bounds.x)),
            bounds.height.min(full_image.height().saturating_sub(bounds.y)),
        );

        // Convert cropped view to owned image
        let cropped_image = cropped.to_image();

        // Convert to PNG and base64 encode
        let mut buffer = Cursor::new(Vec::new());
        cropped_image
            .write_to(&mut buffer, image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode image: {}", e))?;

        let base64_image = STANDARD.encode(buffer.into_inner());

        Ok::<String, String>(base64_image)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    // Show the window again
    window.show().map_err(|e| format!("Failed to show window: {}", e))?;

    result
}

#[tauri::command]
pub async fn open_region_selector(app: AppHandle) -> Result<(), String> {
    // Hide the main window first
    if let Some(main_window) = app.get_webview_window("main") {
        main_window.hide().map_err(|e| format!("Failed to hide main window: {}", e))?;
    }

    // Small delay to ensure main window is hidden
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Capture the screen and get dimensions
    let (width, height, screenshot) = tokio::task::spawn_blocking(|| {
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

        Ok::<(u32, u32, String), String>((monitor.width(), monitor.height(), base64_image))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    // Create a fullscreen window for region selection
    let selector_window = WebviewWindowBuilder::new(
        &app,
        "region-selector",
        WebviewUrl::App("/region-selector".into()),
    )
    .title("")
    .inner_size(width as f64, height as f64)
    .position(0.0, 0.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .fullscreen(true)
    .build()
    .map_err(|e| format!("Failed to create region selector window: {}", e))?;

    // Focus the selector window
    selector_window.set_focus().map_err(|e| format!("Failed to focus window: {}", e))?;

    // Send the screenshot to the region selector window
    // Small delay to ensure window is ready
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
    selector_window
        .emit("screenshot-ready", screenshot)
        .map_err(|e| format!("Failed to emit screenshot: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn close_region_selector(app: AppHandle) -> Result<(), String> {
    // Close the region selector window
    if let Some(selector_window) = app.get_webview_window("region-selector") {
        selector_window.close().map_err(|e| format!("Failed to close selector: {}", e))?;
    }

    // Show the main window
    if let Some(main_window) = app.get_webview_window("main") {
        main_window.show().map_err(|e| format!("Failed to show main window: {}", e))?;
        main_window.set_focus().map_err(|e| format!("Failed to focus main window: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn close_region_selector_with_result(app: AppHandle, image: String) -> Result<(), String> {
    // Close the region selector window
    if let Some(selector_window) = app.get_webview_window("region-selector") {
        selector_window.close().map_err(|e| format!("Failed to close selector: {}", e))?;
    }

    // Show the main window and emit the result
    if let Some(main_window) = app.get_webview_window("main") {
        main_window.show().map_err(|e| format!("Failed to show main window: {}", e))?;
        main_window.set_focus().map_err(|e| format!("Failed to focus main window: {}", e))?;

        // Emit the captured region to the main window
        main_window
            .emit("region-captured", image)
            .map_err(|e| format!("Failed to emit result: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn region_selected(app: AppHandle, bounds: RegionBounds) -> Result<String, String> {
    // Close the region selector window first
    if let Some(selector_window) = app.get_webview_window("region-selector") {
        selector_window.close().map_err(|e| format!("Failed to close selector: {}", e))?;
    }

    // Small delay
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    // Capture the region
    let result = tokio::task::spawn_blocking(move || {
        let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;

        let monitor = monitors
            .into_iter()
            .next()
            .ok_or_else(|| "No monitors found".to_string())?;

        let full_image = monitor
            .capture_image()
            .map_err(|e| format!("Failed to capture screen: {}", e))?;

        // Crop to the selected region
        let cropped = full_image.view(
            bounds.x.min(full_image.width().saturating_sub(1)),
            bounds.y.min(full_image.height().saturating_sub(1)),
            bounds.width.min(full_image.width().saturating_sub(bounds.x)),
            bounds.height.min(full_image.height().saturating_sub(bounds.y)),
        );

        let cropped_image = cropped.to_image();

        let mut buffer = Cursor::new(Vec::new());
        cropped_image
            .write_to(&mut buffer, image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode image: {}", e))?;

        Ok::<String, String>(STANDARD.encode(buffer.into_inner()))
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    // Show the main window and emit the result
    if let Some(main_window) = app.get_webview_window("main") {
        main_window.show().map_err(|e| format!("Failed to show main window: {}", e))?;
        main_window.set_focus().map_err(|e| format!("Failed to focus main window: {}", e))?;

        // Emit the captured region to the main window
        if let Ok(ref image) = result {
            let _ = main_window.emit("region-captured", image.clone());
        }
    }

    result
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
