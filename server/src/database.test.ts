import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase, rollbackMigrations } from "./database";

const createdPaths: string[] = [];

function makeDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-db-"));
  createdPaths.push(dir);
  return path.join(dir, "test.db");
}

afterEach(() => {
  while (createdPaths.length > 0) {
    const entry = createdPaths.pop();
    if (entry) {
      fs.rmSync(entry, { recursive: true, force: true });
    }
  }
});

describe("database migrations", () => {
  it("applies core auth schema", () => {
    const db = new AppDatabase(makeDbPath());
    db.init();

    const tables = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;

    const tableNames = new Set(tables.map((table) => table.name));
    expect(tableNames.has("schema_migrations")).toBe(true);
    expect(tableNames.has("users")).toBe(true);
    expect(tableNames.has("sessions")).toBe(true);
    expect(tableNames.has("settings")).toBe(true);
    expect(tableNames.has("audit_events")).toBe(true);

    db.close();
  });

  it("supports rollback steps", () => {
    const db = new AppDatabase(makeDbPath());
    db.init();

    rollbackMigrations(db.connection, 1);

    const reconciliationRunsTable = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reconciliation_runs'")
      .get() as { name: string } | undefined;

    expect(reconciliationRunsTable).toBeUndefined();

    const shareViewsStillPresent = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'share_views'")
      .get() as { name: string } | undefined;

    expect(shareViewsStillPresent?.name).toBe("share_views");

    rollbackMigrations(db.connection, 1);

    const shareViewsTable = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'share_views'")
      .get() as { name: string } | undefined;

    expect(shareViewsTable).toBeUndefined();

    const galleriesStillPresent = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'galleries'")
      .get() as { name: string } | undefined;

    expect(galleriesStillPresent?.name).toBe("galleries");

    rollbackMigrations(db.connection, 1);

    const galleriesTable = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'galleries'")
      .get() as { name: string } | undefined;

    expect(galleriesTable).toBeUndefined();

    const usersStillPresent = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get() as { name: string } | undefined;

    expect(usersStillPresent?.name).toBe("users");

    rollbackMigrations(db.connection, 1);

    const usersTable = db.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get() as { name: string } | undefined;

    expect(usersTable).toBeUndefined();
    db.close();
  });
});
