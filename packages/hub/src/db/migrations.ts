// Numbered schema migrations. Migration 1 creates every table the MVP needs,
// so later changes add behaviour rather than schema churn (change 0001 design).

export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE bots (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  avatar_color TEXT NOT NULL,
  brain TEXT NOT NULL,
  policy TEXT NOT NULL,
  computer TEXT NOT NULL,
  skills TEXT NOT NULL,
  spend_cap_usd REAL,
  cap_includes_subscription INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'idle',
  last_message_text TEXT,
  last_message_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'group')),
  title TEXT NOT NULL,
  lead_bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  direct_bot_id TEXT UNIQUE REFERENCES bots(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_item_at TEXT
);

CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, bot_id)
);

CREATE TABLE items (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('message', 'event', 'card')),
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'bot', 'system')),
  author_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  mentions TEXT NOT NULL DEFAULT '[]',
  attachments TEXT NOT NULL DEFAULT '[]',
  reactions TEXT NOT NULL DEFAULT '{}',
  run_id TEXT,
  card TEXT,
  event TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX items_by_conversation ON items (conversation_id, seq);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL,
  trigger_ref TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  input TEXT NOT NULL,
  skill TEXT,
  status TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]',
  reply TEXT,
  error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  subscription INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX runs_by_bot ON runs (bot_id, created_at);

CREATE TABLE brain_sessions (
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  session_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bot_id, conversation_id, kind)
);

CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  bot_id TEXT REFERENCES bots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('preference', 'role', 'fact', 'summary')),
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX memory_by_bot ON memory (bot_id, created_at);
CREATE VIRTUAL TABLE memory_fts USING fts5 (text, content = 'memory', content_rowid = 'rowid');
CREATE TRIGGER memory_ai AFTER INSERT ON memory BEGIN
  INSERT INTO memory_fts (rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER memory_ad AFTER DELETE ON memory BEGIN
  INSERT INTO memory_fts (memory_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER memory_au AFTER UPDATE ON memory BEGIN
  INSERT INTO memory_fts (memory_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO memory_fts (rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TABLE routines (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL,
  instruction TEXT NOT NULL,
  approval TEXT NOT NULL DEFAULT 'normal',
  enabled INTEGER NOT NULL DEFAULT 0,
  paused INTEGER NOT NULL DEFAULT 0,
  secret TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE routine_runs (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  run_id TEXT,
  test INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  summary TEXT,
  started_at TEXT NOT NULL
);

CREATE TABLE secrets (
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (bot_id, name)
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  conversation_id TEXT,
  item_id TEXT,
  tool TEXT NOT NULL,
  input TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  decision TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    sql: `ALTER TABLE bots ADD COLUMN tools TEXT NOT NULL DEFAULT '["*"]';`,
  },
  {
    // specs/bots: the manager a bot reports to (change 0014-team-hierarchy).
    version: 3,
    sql: `ALTER TABLE bots ADD COLUMN reports_to TEXT REFERENCES bots(id) ON DELETE SET NULL;`,
  },
  {
    // specs/bots: the avatar's shape, drawn with two eyes (change 0015-orbis-look).
    version: 4,
    sql: `ALTER TABLE bots ADD COLUMN avatar_shape TEXT NOT NULL DEFAULT 'orb';`,
  },
  {
    // specs/tool-gateway: external MCP servers connected to the hub (change 0018-mcp-marketplace).
    // Their keys and sign-in tokens live encrypted in `settings` (hub secrets), never here.
    version: 5,
    sql: `CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  catalog_id TEXT,
  transport TEXT NOT NULL,
  url TEXT,
  command TEXT,
  args TEXT NOT NULL DEFAULT '[]',
  env_keys TEXT NOT NULL DEFAULT '[]',
  auth TEXT NOT NULL,
  read_only INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error TEXT,
  tools TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
  },
  {
    // specs/conversations: the chain a run belongs to, so bot-to-bot work started by
    // one message is bounded (change 0021-bot-behaviour-audit).
    version: 6,
    sql: `ALTER TABLE runs ADD COLUMN chain_id TEXT;
CREATE INDEX idx_runs_chain ON runs(chain_id);`,
  },
  {
    // specs/memory: summaries of runs a colleague's mention or a report started
    // are no memories of the bot's own work; the bot-to-bot loop of change 0021
    // left many identical ones that pulled bots back into it (change 0022).
    version: 7,
    sql: `DELETE FROM memory WHERE kind = 'summary' AND source IN (
  SELECT 'run:' || id FROM runs WHERE trigger_type IN ('mention', 'report'));
DELETE FROM memory WHERE kind = 'summary' AND rowid NOT IN (
  SELECT MIN(rowid) FROM memory WHERE kind = 'summary' GROUP BY COALESCE(bot_id, ''), text);
ALTER TABLE runs ADD COLUMN retry_of TEXT;`,
  },
];
