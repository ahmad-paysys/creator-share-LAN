export interface DbMigration {
  version: number;
  name: string;
  upSql: string;
  downSql: string;
}

export const DB_MIGRATIONS: DbMigration[] = [
  {
    version: 1,
    name: "core_auth_foundation",
    upSql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        display_name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        created_ip TEXT,
        user_agent TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT,
        actor_type TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        result TEXT NOT NULL,
        meta_json TEXT,
        created_at TEXT NOT NULL,
        request_ip TEXT,
        FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
    `,
    downSql: `
      DROP INDEX IF EXISTS idx_audit_action;
      DROP INDEX IF EXISTS idx_audit_created_at;
      DROP TABLE IF EXISTS audit_events;
      DROP TABLE IF EXISTS settings;
      DROP INDEX IF EXISTS idx_sessions_expires_at;
      DROP INDEX IF EXISTS idx_sessions_user_id;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS users;
    `,
  },
];
