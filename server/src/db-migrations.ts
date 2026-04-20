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
  {
    version: 2,
    name: "gallery_core_domain",
    upSql: `
      CREATE TABLE IF NOT EXISTS galleries (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_galleries_visibility ON galleries(visibility);
      CREATE INDEX IF NOT EXISTS idx_galleries_is_deleted ON galleries(is_deleted);

      CREATE TABLE IF NOT EXISTS gallery_items (
        id TEXT PRIMARY KEY,
        gallery_id TEXT NOT NULL,
        media_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        added_by TEXT,
        added_at TEXT NOT NULL,
        FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE,
        FOREIGN KEY(added_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(gallery_id, media_id)
      );

      CREATE INDEX IF NOT EXISTS idx_gallery_items_gallery_id ON gallery_items(gallery_id);

      CREATE TABLE IF NOT EXISTS gallery_access (
        id TEXT PRIMARY KEY,
        gallery_id TEXT NOT NULL,
        subject_type TEXT NOT NULL CHECK(subject_type IN ('role','user')),
        subject_value TEXT NOT NULL,
        permission TEXT NOT NULL CHECK(permission IN ('view')),
        created_by TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(gallery_id) REFERENCES galleries(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(gallery_id, subject_type, subject_value, permission)
      );

      CREATE INDEX IF NOT EXISTS idx_gallery_access_gallery_id ON gallery_access(gallery_id);
      CREATE INDEX IF NOT EXISTS idx_gallery_access_subject ON gallery_access(subject_type, subject_value);
    `,
    downSql: `
      DROP INDEX IF EXISTS idx_gallery_access_subject;
      DROP INDEX IF EXISTS idx_gallery_access_gallery_id;
      DROP TABLE IF EXISTS gallery_access;
      DROP INDEX IF EXISTS idx_gallery_items_gallery_id;
      DROP TABLE IF EXISTS gallery_items;
      DROP INDEX IF EXISTS idx_galleries_is_deleted;
      DROP INDEX IF EXISTS idx_galleries_visibility;
      DROP TABLE IF EXISTS galleries;
    `,
  },
];
