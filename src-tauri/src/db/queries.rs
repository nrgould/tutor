use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

// Types that match the database schema
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub topic: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub screen_context: Option<String>,
    pub created_at: String,
}

// Conversation queries
pub fn create_conversation(conn: &Connection, conversation: &Conversation) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO conversations (id, title, started_at, topic) VALUES (?1, ?2, ?3, ?4)",
        params![
            conversation.id,
            conversation.title,
            conversation.started_at,
            conversation.topic,
        ],
    )?;
    Ok(())
}

pub fn get_conversation(conn: &Connection, id: &str) -> rusqlite::Result<Option<Conversation>> {
    conn.query_row(
        "SELECT id, title, started_at, ended_at, topic, summary FROM conversations WHERE id = ?1",
        params![id],
        |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                topic: row.get(4)?,
                summary: row.get(5)?,
            })
        },
    )
    .optional()
}

pub fn get_conversations(conn: &Connection, limit: i32) -> rusqlite::Result<Vec<Conversation>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, started_at, ended_at, topic, summary
         FROM conversations
         ORDER BY started_at DESC
         LIMIT ?1",
    )?;

    let rows = stmt.query_map(params![limit], |row| {
        Ok(Conversation {
            id: row.get(0)?,
            title: row.get(1)?,
            started_at: row.get(2)?,
            ended_at: row.get(3)?,
            topic: row.get(4)?,
            summary: row.get(5)?,
        })
    })?;

    rows.collect()
}

pub fn update_conversation(
    conn: &Connection,
    id: &str,
    title: Option<&str>,
    ended_at: Option<&str>,
    topic: Option<&str>,
    summary: Option<&str>,
) -> rusqlite::Result<()> {
    // Build dynamic update query based on which fields are provided
    let mut updates = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(t) = title {
        updates.push("title = ?");
        values.push(Box::new(t.to_string()));
    }
    if let Some(e) = ended_at {
        updates.push("ended_at = ?");
        values.push(Box::new(e.to_string()));
    }
    if let Some(t) = topic {
        updates.push("topic = ?");
        values.push(Box::new(t.to_string()));
    }
    if let Some(s) = summary {
        updates.push("summary = ?");
        values.push(Box::new(s.to_string()));
    }

    if updates.is_empty() {
        return Ok(());
    }

    values.push(Box::new(id.to_string()));

    let query = format!(
        "UPDATE conversations SET {} WHERE id = ?",
        updates.join(", ")
    );

    let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&query, params.as_slice())?;

    Ok(())
}

// Message queries
pub fn save_message(conn: &Connection, message: &Message) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO messages (id, conversation_id, role, content, screen_context, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            message.id,
            message.conversation_id,
            message.role,
            message.content,
            message.screen_context,
            message.created_at,
        ],
    )?;
    Ok(())
}

pub fn get_messages(conn: &Connection, conversation_id: &str) -> rusqlite::Result<Vec<Message>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content, screen_context, created_at
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY created_at ASC",
    )?;

    let rows = stmt.query_map(params![conversation_id], |row| {
        Ok(Message {
            id: row.get(0)?,
            conversation_id: row.get(1)?,
            role: row.get(2)?,
            content: row.get(3)?,
            screen_context: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;

    rows.collect()
}

// Settings queries
pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}
