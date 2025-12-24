use crate::db::with_connection;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: Option<i64>,
    pub content: String,
    pub memory_type: String,
    pub topic_id: Option<String>,
    pub source_conversation_id: Option<String>,
    pub embedding: Option<String>, // JSON array of floats
    pub created_at: Option<String>,
    pub last_accessed: Option<String>,
    pub access_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Topic {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub mastery_level: f64,
    pub status: String,
    pub first_seen: Option<String>,
    pub last_practiced: Option<String>,
    pub next_review: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fact {
    pub key: String,
    pub value: String,
    pub confidence: f64,
}

// Memory commands
#[tauri::command]
pub async fn save_memory(memory: Memory) -> Result<i64, String> {
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO memories (content, type, topic_id, source_conversation_id, embedding)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                memory.content,
                memory.memory_type,
                memory.topic_id,
                memory.source_conversation_id,
                memory.embedding,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    })
}

#[tauri::command]
pub async fn get_memories(limit: i32) -> Result<Vec<Memory>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, content, type, topic_id, source_conversation_id, embedding,
                    created_at, last_accessed, access_count
             FROM memories
             ORDER BY created_at DESC
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(Memory {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                memory_type: row.get(2)?,
                topic_id: row.get(3)?,
                source_conversation_id: row.get(4)?,
                embedding: row.get(5)?,
                created_at: row.get(6)?,
                last_accessed: row.get(7)?,
                access_count: row.get(8)?,
            })
        })?;

        rows.collect()
    })
}

#[tauri::command]
pub async fn get_memories_with_embeddings() -> Result<Vec<Memory>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, content, type, topic_id, source_conversation_id, embedding,
                    created_at, last_accessed, access_count
             FROM memories
             WHERE embedding IS NOT NULL",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Memory {
                id: Some(row.get(0)?),
                content: row.get(1)?,
                memory_type: row.get(2)?,
                topic_id: row.get(3)?,
                source_conversation_id: row.get(4)?,
                embedding: row.get(5)?,
                created_at: row.get(6)?,
                last_accessed: row.get(7)?,
                access_count: row.get(8)?,
            })
        })?;

        rows.collect()
    })
}

#[tauri::command]
pub async fn update_memory_access(id: i64) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE memories
             SET last_accessed = datetime('now'), access_count = access_count + 1
             WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    })
}

// Topic commands
#[tauri::command]
pub async fn save_topic(topic: Topic) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO topics (id, name, parent_id, mastery_level, status)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET
                mastery_level = excluded.mastery_level,
                status = excluded.status,
                last_practiced = datetime('now')",
            params![
                topic.id,
                topic.name,
                topic.parent_id,
                topic.mastery_level,
                topic.status,
            ],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn get_topics() -> Result<Vec<Topic>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, mastery_level, status, first_seen, last_practiced, next_review
             FROM topics
             ORDER BY last_practiced DESC NULLS LAST",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Topic {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                mastery_level: row.get(3)?,
                status: row.get(4)?,
                first_seen: row.get(5)?,
                last_practiced: row.get(6)?,
                next_review: row.get(7)?,
            })
        })?;

        rows.collect()
    })
}

#[tauri::command]
pub async fn update_topic_mastery(id: String, mastery_level: f64, status: String) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE topics SET mastery_level = ?1, status = ?2, last_practiced = datetime('now')
             WHERE id = ?3",
            params![mastery_level, status, id],
        )?;

        // Record in mastery history
        conn.execute(
            "INSERT INTO mastery_history (topic_id, mastery_level) VALUES (?1, ?2)",
            params![id, mastery_level],
        )?;

        Ok(())
    })
}

// Fact commands
#[tauri::command]
pub async fn save_fact(fact: Fact) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO facts (key, value, confidence)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                confidence = excluded.confidence,
                updated_at = datetime('now')",
            params![fact.key, fact.value, fact.confidence],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn get_facts() -> Result<Vec<Fact>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT key, value, confidence FROM facts ORDER BY updated_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Fact {
                key: row.get(0)?,
                value: row.get(1)?,
                confidence: row.get(2)?,
            })
        })?;

        rows.collect()
    })
}
