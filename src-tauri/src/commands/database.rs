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
