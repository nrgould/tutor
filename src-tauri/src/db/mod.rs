pub mod queries;
pub mod schema;

use once_cell::sync::OnceCell;
use parking_lot::Mutex;
use rusqlite::Connection;
use std::path::PathBuf;
use tauri::Manager;

static DB: OnceCell<Mutex<Connection>> = OnceCell::new();

pub fn get_db_path(app_handle: &tauri::AppHandle) -> PathBuf {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");

    std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

    app_dir.join("tutor.db")
}

pub fn init(app_handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = get_db_path(app_handle);

    let conn = Connection::open(&db_path)?;
    schema::init_database(&conn)?;

    DB.set(Mutex::new(conn))
        .map_err(|_| "Database already initialized")?;

    Ok(())
}

pub fn with_connection<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> rusqlite::Result<T>,
{
    let db = DB.get().ok_or("Database not initialized")?;
    let conn = db.lock();
    f(&conn).map_err(|e| e.to_string())
}
