import crypto from 'node:crypto'
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

    CREATE TABLE IF NOT EXISTS slash_commands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,
      category TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vector_sync_state (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL UNIQUE,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'indexed', 'failed')),
      point_id TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      indexed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS custom_models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      label TEXT NOT NULL,
      model_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text' CHECK(type IN ('text', 'image')),
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content);

    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      icon TEXT,
      project_id TEXT REFERENCES projects(id),
      embedding_model TEXT NOT NULL DEFAULT 'local' CHECK(embedding_model IN ('local', 'google')),
      embedding_dimensions INTEGER NOT NULL DEFAULT 384,
      sources_count INTEGER NOT NULL DEFAULT 0,
      chunks_count INTEGER NOT NULL DEFAULT 0,
      total_size_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'empty' CHECK(status IN ('empty', 'indexing', 'ready', 'error')),
      last_indexed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_sources (
      id TEXT PRIMARY KEY,
      library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_path TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      extracted_text TEXT,
      extracted_length INTEGER,
      chunks_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'extracting', 'chunking', 'indexing', 'ready', 'error')),
      error_message TEXT,
      content_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS arena_matches (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_message_id TEXT NOT NULL,
      left_message_id TEXT,
      right_message_id TEXT,
      left_provider_id TEXT NOT NULL,
      left_model_id TEXT NOT NULL,
      right_provider_id TEXT NOT NULL,
      right_model_id TEXT NOT NULL,
      vote TEXT,
      voted_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bardas (
      id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT,
      author TEXT,
      is_enabled INTEGER DEFAULT 1,
      roles_count INTEGER DEFAULT 0,
      commands_count INTEGER DEFAULT 0,
      prompts_count INTEGER DEFAULT 0,
      fragments_count INTEGER DEFAULT 0,
      libraries_count INTEGER DEFAULT 0,
      mcp_servers_count INTEGER DEFAULT 0,
      skills_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS library_chunks (
      id TEXT PRIMARY KEY,
      library_id TEXT NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES library_sources(id) ON DELETE CASCADE,
      point_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      start_char INTEGER NOT NULL,
      end_char INTEGER NOT NULL,
      heading TEXT,
      line_start INTEGER,
      line_end INTEGER,
      created_at INTEGER NOT NULL
    );
  `)

  // ── Performance indexes (CREATE INDEX IF NOT EXISTS is idempotent) ──
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
    CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_statistics_date ON statistics(date);
    CREATE INDEX IF NOT EXISTS idx_statistics_project_id ON statistics(project_id);
    CREATE INDEX IF NOT EXISTS idx_images_conversation_id ON images(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_vector_sync_conversation ON vector_sync_state(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_vector_sync_status ON vector_sync_state(status);
    CREATE INDEX IF NOT EXISTS idx_library_sources_library ON library_sources(library_id);
    CREATE INDEX IF NOT EXISTS idx_library_chunks_library ON library_chunks(library_id);
    CREATE INDEX IF NOT EXISTS idx_library_chunks_source ON library_chunks(source_id);
    CREATE INDEX IF NOT EXISTS idx_slash_commands_project ON slash_commands(project_id);
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_project ON mcp_servers(project_id);
    CREATE INDEX IF NOT EXISTS idx_arena_matches_conversation ON arena_matches(conversation_id);
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

  // Add WebSocket remote columns to remote_sessions table (session 25)
  const wsRemoteMigrations = [
    "ALTER TABLE remote_sessions ADD COLUMN session_type TEXT DEFAULT 'telegram'",
    'ALTER TABLE remote_sessions ADD COLUMN ws_client_fingerprint TEXT',
    'ALTER TABLE remote_sessions ADD COLUMN ws_session_token TEXT',
    'ALTER TABLE remote_sessions ADD COLUMN ws_ip_address TEXT'
  ]
  for (const sql of wsRemoteMigrations) {
    try {
      sqlite.exec(sql)
    } catch {
      // Column already exists — ignore
    }
  }

  // Add active_library_id column to conversations table (RAG libraries)
  try {
    sqlite.exec('ALTER TABLE conversations ADD COLUMN active_library_id TEXT')
  } catch {
    // Column already exists — ignore
  }

  // Add is_favorite column to conversations table (favorites feature)
  try {
    sqlite.exec('ALTER TABLE conversations ADD COLUMN is_favorite INTEGER DEFAULT 0')
  } catch {
    // Column already exists — ignore
  }

  // Add is_arena column to conversations table (arena mode)
  try {
    sqlite.exec('ALTER TABLE conversations ADD COLUMN is_arena INTEGER DEFAULT 0')
  } catch {
    // Column already exists — ignore
  }

  // Add is_scheduled_task column to conversations table
  try {
    sqlite.exec('ALTER TABLE conversations ADD COLUMN is_scheduled_task INTEGER DEFAULT 0')
  } catch {
    // Column already exists — ignore
  }

  // Add namespace column to tables managed by Barda packs
  const namespaceMigrations = [
    'ALTER TABLE roles ADD COLUMN namespace TEXT',
    'ALTER TABLE slash_commands ADD COLUMN namespace TEXT',
    'ALTER TABLE prompts ADD COLUMN namespace TEXT',
    'ALTER TABLE memory_fragments ADD COLUMN namespace TEXT',
    'ALTER TABLE libraries ADD COLUMN namespace TEXT',
    'ALTER TABLE mcp_servers ADD COLUMN namespace TEXT'
  ]
  for (const sql of namespaceMigrations) {
    try {
      sqlite.exec(sql)
    } catch {
      // Column already exists — ignore
    }
  }

  // Barda indexes
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bardas_namespace ON bardas(namespace);
    CREATE INDEX IF NOT EXISTS idx_roles_namespace ON roles(namespace);
    CREATE INDEX IF NOT EXISTS idx_slash_commands_namespace ON slash_commands(namespace);
    CREATE INDEX IF NOT EXISTS idx_prompts_namespace ON prompts(namespace);
    CREATE INDEX IF NOT EXISTS idx_memory_fragments_namespace ON memory_fragments(namespace);
    CREATE INDEX IF NOT EXISTS idx_libraries_namespace ON libraries(namespace);
    CREATE INDEX IF NOT EXISTS idx_mcp_servers_namespace ON mcp_servers(namespace);
  `)

  // --- Refactor workspace-sandbox (S44) ---

  // Add workspace_path to conversations (always has a default)
  try {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '~/.cruchot/sandbox/'`)
  } catch {
    // Column already exists — ignore
  }

  // Migrate existing conversations: inherit workspace_path from their project
  sqlite.exec(`
    UPDATE conversations SET workspace_path = (
      SELECT p.workspace_path FROM projects p WHERE p.id = conversations.project_id
    ) WHERE project_id IS NOT NULL AND (
      SELECT p.workspace_path FROM projects p WHERE p.id = conversations.project_id
    ) IS NOT NULL
  `)

  // Drop old YOLO index (no longer needed)
  sqlite.exec(`DROP INDEX IF EXISTS idx_conversations_is_yolo`)

  // --- Skills system (S46) ---
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      allowed_tools TEXT,
      shell TEXT DEFAULT 'bash',
      effort TEXT,
      argument_hint TEXT,
      user_invocable INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      source TEXT NOT NULL CHECK(source IN ('local', 'git', 'barda')),
      git_url TEXT,
      namespace TEXT,
      maton_verdict TEXT,
      maton_report TEXT,
      installed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
    CREATE INDEX IF NOT EXISTS idx_skills_namespace ON skills(namespace);
    CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
  `)

  // Add skills_count to bardas (idempotent — column may already exist)
  try { sqlite.exec('ALTER TABLE bardas ADD COLUMN skills_count INTEGER DEFAULT 0') } catch {
    // Column already exists — ignore
  }

  // --- Permission Rules (tool access control) ---
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS permission_rules (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      rule_content TEXT,
      behavior TEXT NOT NULL CHECK(behavior IN ('allow', 'deny', 'ask')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_permission_rules_tool ON permission_rules(tool_name);
  `)

  // Seed minimal deny rules on first boot (table empty).
  // Full rule set is seeded by resetPermissionRules() in db/queries/permissions.ts.
  const existingRules = sqlite.prepare('SELECT COUNT(*) as count FROM permission_rules').get() as { count: number }
  if (existingRules.count === 0) {
    const now = Math.floor(Date.now() / 1000)
    const seedRules = [
      { tool: 'bash', content: 'rm -rf *', behavior: 'deny' },
      { tool: 'bash', content: 'sudo *', behavior: 'deny' },
      { tool: 'bash', content: 'chmod *', behavior: 'deny' },
      { tool: 'bash', content: 'chown *', behavior: 'deny' },
      { tool: 'bash', content: 'npm *', behavior: 'allow' },
      { tool: 'bash', content: 'npx *', behavior: 'allow' },
      { tool: 'bash', content: 'git *', behavior: 'allow' },
      { tool: 'bash', content: 'node *', behavior: 'allow' },
      { tool: 'bash', content: 'python3 *', behavior: 'allow' },
      { tool: 'bash', content: 'python *', behavior: 'allow' },
      { tool: 'bash', content: 'pip3 *', behavior: 'allow' },
      { tool: 'bash', content: 'pip *', behavior: 'allow' },
      { tool: 'bash', content: 'mkdir *', behavior: 'allow' },
      { tool: 'bash', content: 'touch *', behavior: 'allow' },
      { tool: 'bash', content: 'cp *', behavior: 'allow' },
      { tool: 'bash', content: 'mv *', behavior: 'allow' },
      { tool: 'bash', content: 'rm *', behavior: 'allow' },
      { tool: 'bash', content: 'curl *', behavior: 'allow' },
      { tool: 'WebFetchTool', content: '*.github.com', behavior: 'allow' },
      { tool: 'WebFetchTool', content: '*.npmjs.com', behavior: 'allow' },
      { tool: 'WebFetchTool', content: '*.stackoverflow.com', behavior: 'allow' },
      { tool: 'WebFetchTool', content: '*.pypi.org', behavior: 'allow' },
    ]
    const insert = sqlite.prepare(
      'INSERT INTO permission_rules (id, tool_name, rule_content, behavior, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    for (const rule of seedRules) {
      insert.run(crypto.randomUUID(), rule.tool, rule.content, rule.behavior, now)
    }
  }
}
