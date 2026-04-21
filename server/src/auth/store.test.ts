import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStore } from "./store";
import { AppDatabase } from "../core/database";

const createdDirs: string[] = [];

function setupStore(): { appDb: AppDatabase; store: AuthStore } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-store-"));
  createdDirs.push(dir);
  const dbPath = path.join(dir, "store.db");
  const appDb = new AppDatabase(dbPath);
  appDb.init();
  const store = new AuthStore(appDb.connection);
  return { appDb, store };
}

afterEach(() => {
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("AuthStore", () => {
  it("creates and retrieves users", () => {
    const { appDb, store } = setupStore();

    expect(store.countUsers()).toBe(0);

    const created = store.createUser({
      username: "owner",
      displayName: "Owner",
      passwordHash: "dummy-hash",
      role: "owner",
    });

    expect(created.username).toBe("owner");
    expect(store.countUsers()).toBe(1);

    const fetched = store.getUserByUsername("owner");
    expect(fetched?.id).toBe(created.id);
    expect(store.getUserById(created.id)?.username).toBe("owner");

    appDb.close();
  });

  it("creates and resolves sessions", () => {
    const { appDb, store } = setupStore();
    const user = store.createUser({
      username: "viewer",
      displayName: null,
      passwordHash: "dummy-hash",
      role: "viewer",
    });

    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    store.createSession({
      userId: user.id,
      tokenHash: "token-hash",
      expiresAt,
      createdIp: "127.0.0.1",
      userAgent: "vitest",
    });

    const resolved = store.getAuthenticatedSessionByTokenHash("token-hash", new Date().toISOString());
    expect(resolved?.user.username).toBe("viewer");

    store.deleteSessionByTokenHash("token-hash");
    const afterDelete = store.getAuthenticatedSessionByTokenHash("token-hash", new Date().toISOString());
    expect(afterDelete).toBeNull();

    appDb.close();
  });
});


