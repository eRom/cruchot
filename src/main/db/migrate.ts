import { getSqliteDatabase } from './index'

/**
 * Creates all tables if they don't exist.
 * Called once at startup — idempotent.
 */
export function runMigrations(): void {
  const sqlite = getSqliteDatabase()

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('cloud', 'local')),
      base_url TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL REFERENCES providers(id),
      name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      context_window INTEGER NOT NULL,
      input_price REAL,
      output_price REAL,
      supports_images INTEGER NOT NULL DEFAULT 0,
      supports_streaming INTEGER NOT NULL DEFAULT 1,
      is_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT,
      default_model_id TEXT,
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT,
      icon TEXT,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id),
      model_id TEXT,
      role_id TEXT REFERENCES roles(id),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      parent_message_id TEXT,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      content_data TEXT,
      model_id TEXT,
      provider_id TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      cost REAL,
      response_time_ms INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      type TEXT NOT NULL CHECK(type IN ('complet', 'complement', 'system')),
      variables TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS statistics (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      provider_id TEXT,
      model_id TEXT,
      project_id TEXT,
      messages_count INTEGER NOT NULL DEFAULT 0,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      avg_response_time_ms REAL
    );

    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      conversation_id TEXT REFERENCES conversations(id),
      message_id TEXT REFERENCES messages(id),
      prompt TEXT NOT NULL,
      model_id TEXT,
      width INTEGER,
      height INTEGER,
      path TEXT NOT NULL,
      size INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tts_usage (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      text_length INTEGER NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model_id TEXT NOT NULL,
      role_id TEXT REFERENCES roles(id),
      project_id TEXT REFERENCES projects(id),
      schedule_type TEXT NOT NULL CHECK(schedule_type IN ('manual', 'interval', 'daily', 'weekly')),
      schedule_config TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      next_run_at INTEGER,
      last_run_status TEXT CHECK(last_run_status IN ('success', 'error')),
      last_run_error TEXT,
      last_conversation_id TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      transport_type TEXT NOT NULL CHECK(transport_type IN ('stdio', 'http', 'sse')),
      command TEXT,
      args TEXT,
      cwd TEXT,
      url TEXT,
      headers TEXT,
      env_encrypted TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      project_id TEXT REFERENCES projects(id),
      icon TEXT,
      color TEXT,
      tool_timeout INTEGER DEFAULT 30000,
      auto_confirm INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memory_fragments (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS remote_sessions (
      id TEXT PRIMARY KEY,
      telegram_chat_id TEXT,
      bot_username TEXT,
      paired_at INTEGER,
      last_activity INTEGER,
      is_active INTEGER NOT NULL DEFAULT 0,
      conversation_id TEXT REFERENCES conversations(id),
      auto_approve_read INTEGER NOT NULL DEFAULT 1,
      auto_approve_write INTEGER NOT NULL DEFAULT 0,
      auto_approve_bash INTEGER NOT NULL DEFAULT 0,
      auto_approve_list INTEGER NOT NULL DEFAULT 1,
      auto_approve_mcp INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content);
  `)

  // ── Incremental migrations (idempotent) ────────────────
  // Add category, tags, variables columns to roles table
  const roleMigrations = [
    'ALTER TABLE roles ADD COLUMN category TEXT',
    'ALTER TABLE roles ADD COLUMN tags TEXT',
    'ALTER TABLE roles ADD COLUMN variables TEXT'
  ]
  for (const sql of roleMigrations) {
    try {
      sqlite.exec(sql)
    } catch {
      // Column already exists — ignore
    }
  }

  // Add workspace_path column to projects table
  const projectMigrations = [
    'ALTER TABLE projects ADD COLUMN workspace_path TEXT'
  ]
  for (const sql of projectMigrations) {
    try {
      sqlite.exec(sql)
    } catch {
      // Column already exists — ignore
    }
  }

  // Add use_memory column to scheduled_tasks table
  try {
    sqlite.exec('ALTER TABLE scheduled_tasks ADD COLUMN use_memory INTEGER NOT NULL DEFAULT 1')
  } catch {
    // Column already exists — ignore
  }
}
