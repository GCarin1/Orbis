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
  {
    // Lookups every run makes (its reply, its cards, its approvals, its routine record)
    // and the chat's runs of a conversation scanned whole tables (audit cycle 5).
    version: 8,
    sql: `CREATE INDEX items_by_run ON items (run_id);
CREATE INDEX runs_by_conversation ON runs (conversation_id, created_at);
CREATE INDEX runs_by_status ON runs (status);
CREATE INDEX approvals_by_run ON approvals (run_id, status);
CREATE INDEX routine_runs_by_run ON routine_runs (run_id);`,
  },
  {
    // specs/conversations: a group's description, photo and mute, as a chat app's group info
    // shows them (change 0042-group-info-like-a-chat-app).
    version: 9,
    sql: `ALTER TABLE conversations ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN photo TEXT;
ALTER TABLE conversations ADD COLUMN muted INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    // specs/hiring: rounds of short résumés written by a recruiter bot's brain, and the candidates
    // hired from them (change 0049-hiring).
    version: 10,
    sql: `CREATE TABLE hiring_rounds (
  id TEXT PRIMARY KEY,
  basis TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  group_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  recruiter_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  requested INTEGER NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE hiring_candidates (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES hiring_rounds(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  headline TEXT NOT NULL,
  strengths TEXT NOT NULL,
  tools TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  error TEXT,
  bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX candidates_by_round ON hiring_candidates (round_id, position);`,
  },
  {
    // specs/squads: bots organized in squads with a representative and a manager; routines called
    // by other bots say who called them (change 0050-squads).
    version: 11,
    sql: `CREATE TABLE squads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  representative_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  manager_id TEXT REFERENCES bots(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
ALTER TABLE bots ADD COLUMN squad_id TEXT REFERENCES squads(id) ON DELETE SET NULL;
ALTER TABLE routine_runs ADD COLUMN called_by TEXT;`,
  },
  {
    // specs/conversations: files sent in a conversation, by the user or by a bot; the bytes live in
    // <data>/files/<id> (change 0059-files-conversations-sends-bots).
    version: 12,
    sql: `CREATE TABLE files (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  author_type TEXT NOT NULL,
  author_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX files_by_conversation ON files (conversation_id, created_at);`,
  },
  {
    // specs/bots: a bot writing to the user on its own, and each time it was given the chance
    // (change 0060-bot-initiative).
    version: 13,
    sql: `ALTER TABLE bots ADD COLUMN initiative TEXT;
CREATE TABLE initiatives (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  run_id TEXT,
  posted INTEGER NOT NULL DEFAULT 0,
  posted_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX initiatives_by_bot ON initiatives (bot_id, created_at);`,
  },
  {
    // specs/health: the user's health data read from Health Connect on the phone, one value per day and
    // metric, and their workouts (change 0062-health-connect).
    version: 14,
    sql: `CREATE TABLE health_metrics (
  date TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, metric)
);
CREATE TABLE health_sessions (
  id TEXT PRIMARY KEY,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT,
  source TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX health_sessions_by_start ON health_sessions (start_at);`,
  },
];
