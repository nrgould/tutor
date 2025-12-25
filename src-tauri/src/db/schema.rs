use rusqlite::Connection;

pub fn init_database(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        -- Conversations table
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            title TEXT,
            started_at TEXT DEFAULT (datetime('now')),
            ended_at TEXT,
            topic TEXT,
            summary TEXT
        );

        -- Messages table
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
            content TEXT NOT NULL,
            screen_context TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        );

        -- Facts table (persistent truths about the user)
        CREATE TABLE IF NOT EXISTS facts (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            confidence REAL DEFAULT 1.0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        -- Topics table
        CREATE TABLE IF NOT EXISTS topics (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            parent_id TEXT,
            mastery_level REAL DEFAULT 0.0,
            status TEXT DEFAULT 'new' CHECK (status IN ('new', 'struggling', 'learning', 'proficient', 'mastered')),
            first_seen TEXT DEFAULT (datetime('now')),
            last_practiced TEXT,
            next_review TEXT,
            FOREIGN KEY (parent_id) REFERENCES topics(id)
        );

        -- Mastery history table
        CREATE TABLE IF NOT EXISTS mastery_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id TEXT NOT NULL,
            mastery_level REAL NOT NULL,
            recorded_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (topic_id) REFERENCES topics(id)
        );

        -- Events table (append-only log)
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK (type IN ('struggle', 'breakthrough', 'practice', 'question', 'mastered')),
            topic_id TEXT,
            description TEXT NOT NULL,
            conversation_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (topic_id) REFERENCES topics(id),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        );

        -- Memories table (semantic memories for retrieval)
        CREATE TABLE IF NOT EXISTS memories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('preference', 'struggle', 'success', 'context')),
            topic_id TEXT,
            source_conversation_id TEXT,
            embedding TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            last_accessed TEXT,
            access_count INTEGER DEFAULT 0,
            FOREIGN KEY (topic_id) REFERENCES topics(id),
            FOREIGN KEY (source_conversation_id) REFERENCES conversations(id)
        );

        -- Settings table
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Recording sessions table
        CREATE TABLE IF NOT EXISTS recording_sessions (
            id TEXT PRIMARY KEY,
            name TEXT,
            started_at TEXT DEFAULT (datetime('now')),
            ended_at TEXT,
            interval_seconds INTEGER DEFAULT 30,
            screenshot_count INTEGER DEFAULT 0,
            notes TEXT,
            summary TEXT
        );

        -- Screenshots table
        CREATE TABLE IF NOT EXISTS screenshots (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            image_data TEXT NOT NULL,
            thumbnail_data TEXT,
            captured_at TEXT DEFAULT (datetime('now')),
            app_name TEXT,
            window_title TEXT,
            notes TEXT,
            FOREIGN KEY (session_id) REFERENCES recording_sessions(id)
        );

        -- Create indexes for screenshots
        CREATE INDEX IF NOT EXISTS idx_screenshots_session_id ON screenshots(session_id);
        CREATE INDEX IF NOT EXISTS idx_screenshots_captured_at ON screenshots(captured_at);

        -- Insert default settings if they don't exist
        INSERT OR IGNORE INTO settings (key, value) VALUES
            ('anthropic_api_key', ''),
            ('openai_api_key', ''),
            ('hotkey_overlay', 'Ctrl+Shift+Space'),
            ('hotkey_screenshot', 'Ctrl+Shift+S'),
            ('theme', 'system'),
            ('overlay_position', '{"x": 100, "y": 100}'),
            ('overlay_size', '{"width": 400, "height": 500}');

        -- Create indexes for better query performance
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_events_topic_id ON events(topic_id);
        CREATE INDEX IF NOT EXISTS idx_events_conversation_id ON events(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_memories_topic_id ON memories(topic_id);
        CREATE INDEX IF NOT EXISTS idx_topics_parent_id ON topics(parent_id);
        "#,
    )?;

    // Migration: Add embedding column if it doesn't exist (for existing databases)
    let has_embedding: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('memories') WHERE name='embedding'",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0) > 0;

    if !has_embedding {
        conn.execute("ALTER TABLE memories ADD COLUMN embedding TEXT", [])?;
    }

    Ok(())
}
