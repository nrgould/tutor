use crate::db::{queries, with_connection};
use serde::{Deserialize, Serialize};

// Re-export types from queries for convenience
pub use queries::{Conversation, Message};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationUpdate {
    pub title: Option<String>,
    pub ended_at: Option<String>,
    pub topic: Option<String>,
    pub summary: Option<String>,
}

// Conversation commands
#[tauri::command]
pub async fn create_conversation(conversation: Conversation) -> Result<(), String> {
    with_connection(|conn| queries::create_conversation(conn, &conversation))
}

#[tauri::command]
pub async fn get_conversation(id: String) -> Result<Option<Conversation>, String> {
    with_connection(|conn| queries::get_conversation(conn, &id))
}

#[tauri::command]
pub async fn get_conversations(limit: i32) -> Result<Vec<Conversation>, String> {
    with_connection(|conn| queries::get_conversations(conn, limit))
}

#[tauri::command]
pub async fn update_conversation(id: String, updates: ConversationUpdate) -> Result<(), String> {
    with_connection(|conn| {
        queries::update_conversation(
            conn,
            &id,
            updates.title.as_deref(),
            updates.ended_at.as_deref(),
            updates.topic.as_deref(),
            updates.summary.as_deref(),
        )
    })
}

// Message commands
#[tauri::command]
pub async fn save_message(message: Message) -> Result<(), String> {
    with_connection(|conn| queries::save_message(conn, &message))
}

#[tauri::command]
pub async fn get_messages(conversation_id: String) -> Result<Vec<Message>, String> {
    with_connection(|conn| queries::get_messages(conn, &conversation_id))
}

// Settings commands
#[tauri::command]
pub async fn get_setting(key: String) -> Result<Option<String>, String> {
    with_connection(|conn| queries::get_setting(conn, &key))
}

#[tauri::command]
pub async fn set_setting(key: String, value: String) -> Result<(), String> {
    with_connection(|conn| queries::set_setting(conn, &key, &value))
}

// Data cleanup commands
#[derive(Debug, Clone, Serialize)]
pub struct CleanupResult {
    pub sessions_deleted: i32,
    pub screenshots_deleted: i32,
    pub messages_cleaned: i32,
    pub bytes_freed_estimate: i64,
}

/// Clean up old recording sessions and their screenshots
/// retention_days: Number of days to keep data (default 7)
#[tauri::command]
pub async fn cleanup_old_data(retention_days: Option<i32>) -> Result<CleanupResult, String> {
    let days = retention_days.unwrap_or(7);

    with_connection(|conn| {
        // Calculate cutoff date
        let cutoff = format!("-{} days", days);

        // Count screenshots to be deleted (for estimate)
        let screenshots_count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM screenshots
             WHERE session_id IN (
                SELECT id FROM recording_sessions
                WHERE ended_at IS NOT NULL
                AND datetime(ended_at) < datetime('now', ?1)
             )",
            [&cutoff],
            |row| row.get(0),
        ).unwrap_or(0);

        // Estimate bytes (average ~2MB per screenshot as base64)
        let bytes_estimate = screenshots_count as i64 * 2_000_000;

        // Delete screenshots from old sessions
        let screenshots_deleted = conn.execute(
            "DELETE FROM screenshots
             WHERE session_id IN (
                SELECT id FROM recording_sessions
                WHERE ended_at IS NOT NULL
                AND datetime(ended_at) < datetime('now', ?1)
             )",
            [&cutoff],
        ).unwrap_or(0) as i32;

        // Delete old recording sessions
        let sessions_deleted = conn.execute(
            "DELETE FROM recording_sessions
             WHERE ended_at IS NOT NULL
             AND datetime(ended_at) < datetime('now', ?1)",
            [&cutoff],
        ).unwrap_or(0) as i32;

        // Clean screen_context from old messages (keep message but remove large screenshot data)
        let messages_cleaned = conn.execute(
            "UPDATE messages SET screen_context = NULL
             WHERE screen_context IS NOT NULL
             AND datetime(created_at) < datetime('now', ?1)",
            [&cutoff],
        ).unwrap_or(0) as i32;

        // Run VACUUM to actually reclaim space (this can be slow for large DBs)
        // Only do this if we actually deleted something significant
        if screenshots_deleted > 10 {
            let _ = conn.execute("VACUUM", []);
        }

        Ok(CleanupResult {
            sessions_deleted,
            screenshots_deleted,
            messages_cleaned,
            bytes_freed_estimate: bytes_estimate,
        })
    })
}

/// Get database storage statistics
#[tauri::command]
pub async fn get_storage_stats() -> Result<StorageStats, String> {
    with_connection(|conn| {
        let screenshot_count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM screenshots",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        let session_count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM recording_sessions",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        let message_with_screen_count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE screen_context IS NOT NULL",
            [],
            |row| row.get(0),
        ).unwrap_or(0);

        // Estimate total size (rough: ~2MB per screenshot, ~500KB per message with screen)
        let estimated_bytes = (screenshot_count as i64 * 2_000_000) +
                             (message_with_screen_count as i64 * 500_000);

        Ok(StorageStats {
            screenshot_count,
            session_count,
            message_with_screen_count,
            estimated_bytes,
        })
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageStats {
    pub screenshot_count: i32,
    pub session_count: i32,
    pub message_with_screen_count: i32,
    pub estimated_bytes: i64,
}

// Import commands for backup/restore
#[tauri::command]
pub async fn import_conversation(conversation: Conversation) -> Result<(), String> {
    with_connection(|conn| {
        // Use INSERT OR REPLACE to handle duplicates
        conn.execute(
            "INSERT OR REPLACE INTO conversations (id, title, started_at, ended_at, topic, summary)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                conversation.id,
                conversation.title,
                conversation.started_at,
                conversation.ended_at,
                conversation.topic,
                conversation.summary,
            ],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn import_message(message: Message) -> Result<(), String> {
    with_connection(|conn| {
        let screen_context_json = message
            .screen_context
            .as_ref()
            .map(|sc| serde_json::to_string(sc).unwrap_or_default());

        conn.execute(
            "INSERT OR REPLACE INTO messages (id, conversation_id, role, content, screen_context, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                message.id,
                message.conversation_id,
                message.role,
                message.content,
                screen_context_json,
                message.created_at,
            ],
        )?;
        Ok(())
    })
}
