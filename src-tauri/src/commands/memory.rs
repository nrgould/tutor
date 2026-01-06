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

#[tauri::command]
pub async fn update_topic_parent(topic_id: String, parent_id: String) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE topics SET parent_id = ?1 WHERE id = ?2",
            params![parent_id, topic_id],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn delete_topic(id: String) -> Result<(), String> {
    with_connection(|conn| {
        // First update any topics that have this as parent to have no parent
        conn.execute(
            "UPDATE topics SET parent_id = NULL WHERE parent_id = ?1",
            params![id],
        )?;
        // Delete mastery history
        conn.execute(
            "DELETE FROM mastery_history WHERE topic_id = ?1",
            params![id],
        )?;
        // Delete the topic
        conn.execute(
            "DELETE FROM topics WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn reassign_topic_parent(old_parent_id: String, new_parent_id: String) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE topics SET parent_id = ?1 WHERE parent_id = ?2",
            params![new_parent_id, old_parent_id],
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

// Reset all learning data (topics, memories, facts, mastery history, review items)
#[tauri::command]
pub async fn reset_all_learning_data() -> Result<(), String> {
    with_connection(|conn| {
        // Delete all mastery history
        conn.execute("DELETE FROM mastery_history", [])?;
        // Delete all topics
        conn.execute("DELETE FROM topics", [])?;
        // Delete all memories
        conn.execute("DELETE FROM memories", [])?;
        // Delete all facts
        conn.execute("DELETE FROM facts", [])?;
        // Delete all review items
        conn.execute("DELETE FROM review_items", [])?;
        Ok(())
    })
}

// Review item types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewItem {
    pub id: String,
    pub topic_id: Option<String>,
    pub question_type: String, // 'flashcard', 'multiple_choice', 'true_false'
    pub question: String,
    pub answer: String,
    pub options: Option<String>, // JSON array for multiple choice
    pub source_conversation_id: Option<String>,
    pub ease_factor: f64,
    pub interval: i32,
    pub repetitions: i32,
    pub next_review: Option<String>,
    pub last_reviewed: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewItemInput {
    pub id: String,
    pub topic_id: Option<String>,
    pub question_type: String,
    pub question: String,
    pub answer: String,
    pub options: Option<String>,
    pub source_conversation_id: Option<String>,
}

// Review item commands
#[tauri::command]
pub async fn save_review_item(item: ReviewItemInput) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "INSERT INTO review_items (id, topic_id, question_type, question, answer, options, source_conversation_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                question = excluded.question,
                answer = excluded.answer,
                options = excluded.options",
            params![
                item.id,
                item.topic_id,
                item.question_type,
                item.question,
                item.answer,
                item.options,
                item.source_conversation_id,
            ],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn get_review_items() -> Result<Vec<ReviewItem>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, topic_id, question_type, question, answer, options,
                    source_conversation_id, ease_factor, interval, repetitions,
                    next_review, last_reviewed, created_at
             FROM review_items
             ORDER BY next_review ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(ReviewItem {
                id: row.get(0)?,
                topic_id: row.get(1)?,
                question_type: row.get(2)?,
                question: row.get(3)?,
                answer: row.get(4)?,
                options: row.get(5)?,
                source_conversation_id: row.get(6)?,
                ease_factor: row.get(7)?,
                interval: row.get(8)?,
                repetitions: row.get(9)?,
                next_review: row.get(10)?,
                last_reviewed: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?;

        rows.collect()
    })
}

#[tauri::command]
pub async fn get_due_review_items() -> Result<Vec<ReviewItem>, String> {
    with_connection(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, topic_id, question_type, question, answer, options,
                    source_conversation_id, ease_factor, interval, repetitions,
                    next_review, last_reviewed, created_at
             FROM review_items
             WHERE next_review <= datetime('now')
             ORDER BY next_review ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(ReviewItem {
                id: row.get(0)?,
                topic_id: row.get(1)?,
                question_type: row.get(2)?,
                question: row.get(3)?,
                answer: row.get(4)?,
                options: row.get(5)?,
                source_conversation_id: row.get(6)?,
                ease_factor: row.get(7)?,
                interval: row.get(8)?,
                repetitions: row.get(9)?,
                next_review: row.get(10)?,
                last_reviewed: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?;

        rows.collect()
    })
}

#[tauri::command]
pub async fn update_review_item_schedule(
    id: String,
    ease_factor: f64,
    interval: i32,
    repetitions: i32,
    next_review: String,
) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute(
            "UPDATE review_items
             SET ease_factor = ?1, interval = ?2, repetitions = ?3,
                 next_review = ?4, last_reviewed = datetime('now')
             WHERE id = ?5",
            params![ease_factor, interval, repetitions, next_review, id],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub async fn delete_review_item(id: String) -> Result<(), String> {
    with_connection(|conn| {
        conn.execute("DELETE FROM review_items WHERE id = ?1", params![id])?;
        Ok(())
    })
}

#[tauri::command]
pub async fn get_review_stats() -> Result<ReviewStats, String> {
    with_connection(|conn| {
        let total: i32 = conn.query_row(
            "SELECT COUNT(*) FROM review_items",
            [],
            |row| row.get(0),
        )?;

        let due: i32 = conn.query_row(
            "SELECT COUNT(*) FROM review_items WHERE next_review <= datetime('now')",
            [],
            |row| row.get(0),
        )?;

        let mastered: i32 = conn.query_row(
            "SELECT COUNT(*) FROM review_items WHERE interval >= 21",
            [],
            |row| row.get(0),
        )?;

        Ok(ReviewStats { total, due, mastered })
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewStats {
    pub total: i32,
    pub due: i32,
    pub mastered: i32,
}
