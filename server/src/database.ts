import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_MIGRATIONS } from "./db-migrations";

function ensureMigrationTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function getAppliedVersions(db: Database.Database): Set<number> {
  const rows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version ASC")
    .all() as Array<{ version: number }>;
  return new Set(rows.map((row) => row.version));
}

export function migrateToLatest(db: Database.Database): void {
  ensureMigrationTable(db);
  const applied = getAppliedVersions(db);

  for (const migration of DB_MIGRATIONS) {
    if (applied.has(migration.version)) {
      continue;
    }

    const apply = db.transaction(() => {
      db.exec(migration.upSql);
      db.prepare(
        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.version, migration.name, new Date().toISOString());
    });

    apply();
  }
}

export function rollbackMigrations(db: Database.Database, steps: number): void {
  ensureMigrationTable(db);
  const appliedRows = db
    .prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT ?")
    .all(steps) as Array<{ version: number }>;

  for (const row of appliedRows) {
    const migration = DB_MIGRATIONS.find((entry) => entry.version === row.version);
    if (!migration) {
      continue;
    }

    const rollback = db.transaction(() => {
      db.exec(migration.downSql);
      db.prepare("DELETE FROM schema_migrations WHERE version = ?").run(migration.version);
    });

    rollback();
  }
}

export class AppDatabase {
  private db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  public init(): void {
    migrateToLatest(this.db);
  }

  public close(): void {
    this.db.close();
  }

  public get connection(): Database.Database {
    return this.db;
  }
}
