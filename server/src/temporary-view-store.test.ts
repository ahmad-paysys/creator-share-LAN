import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStore } from "./auth-store";
import { AppDatabase } from "./database";
import { TemporaryViewStore } from "./temporary-view-store";

const dirs: string[] = [];

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-view-store-"));
  dirs.push(dir);
  const appDb = new AppDatabase(path.join(dir, "app.db"));
  appDb.init();
  const authStore = new AuthStore(appDb.connection);
  const viewStore = new TemporaryViewStore(appDb.connection);
  return { appDb, authStore, viewStore };
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("TemporaryViewStore", () => {
  it("creates and consumes expiring views", () => {
    const { appDb, authStore, viewStore } = setup();
    const owner = authStore.createUser({
      username: "owner",
      displayName: "Owner",
      passwordHash: "hash",
      role: "owner",
    });

    viewStore.createView({
      slug: "tempview1",
      title: "Temp View",
      visibility: "public",
      sourceType: "selection",
      sourceGalleryId: null,
      createdBy: owner.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: 2,
      mediaIds: ["m1", "m2"],
    });

    const first = viewStore.consume("tempview1");
    expect(first.ok).toBe(true);

    const second = viewStore.consume("tempview1");
    expect(second.ok).toBe(true);

    const third = viewStore.consume("tempview1");
    expect(third).toEqual({ ok: false, reason: "exhausted" });

    appDb.close();
  });

  it("returns expired and revoked states", () => {
    const { appDb, authStore, viewStore } = setup();
    const owner = authStore.createUser({
      username: "owner",
      displayName: "Owner",
      passwordHash: "hash",
      role: "owner",
    });

    viewStore.createView({
      slug: "expiredview",
      title: "Expired",
      visibility: "public",
      sourceType: "selection",
      sourceGalleryId: null,
      createdBy: owner.id,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      maxUses: null,
      mediaIds: ["m1"],
    });

    expect(viewStore.consume("expiredview")).toEqual({ ok: false, reason: "expired" });

    viewStore.createView({
      slug: "revokedview",
      title: "Revoked",
      visibility: "private",
      sourceType: "selection",
      sourceGalleryId: null,
      createdBy: owner.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: null,
      mediaIds: ["m1"],
    });

    viewStore.revoke("revokedview");
    expect(viewStore.consume("revokedview")).toEqual({ ok: false, reason: "revoked" });

    appDb.close();
  });
});
