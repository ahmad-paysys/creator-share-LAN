import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStore } from "./auth-store";
import { AppDatabase } from "./core/database";
import { GalleryStore } from "./gallery-store";
import { ReconciliationService } from "./reconciliation-service";
import { ReconciliationStore } from "./reconciliation-store";
import { TemporaryViewStore } from "./temporary-view-store";
import type { MediaItem } from "./types/app";

const dirs: string[] = [];

function media(input: {
  id: string;
  relativePath: string;
  name: string;
  originalSize: number;
  createdAt: string;
  type?: "image" | "video";
}): MediaItem {
  return {
    id: input.id,
    folderId: "folder-a",
    relativePath: input.relativePath,
    absolutePath: `C:/media/${input.relativePath}`,
    name: input.name,
    type: input.type ?? "image",
    originalSize: input.originalSize,
    thumbnailUrl: `/thumbnails/${input.id}.jpg`,
    createdAt: input.createdAt,
  };
}

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-reconcile-"));
  dirs.push(dir);

  const appDb = new AppDatabase(path.join(dir, "app.db"));
  appDb.init();

  const authStore = new AuthStore(appDb.connection);
  const galleryStore = new GalleryStore(appDb.connection);
  const temporaryViewStore = new TemporaryViewStore(appDb.connection);
  const reconciliationStore = new ReconciliationStore(appDb.connection);
  const reconciliationService = new ReconciliationService(reconciliationStore);

  const owner = authStore.createUser({
    username: "owner",
    displayName: "Owner",
    passwordHash: "hash",
    role: "owner",
  });

  return {
    appDb,
    owner,
    galleryStore,
    temporaryViewStore,
    reconciliationStore,
    reconciliationService,
  };
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("ReconciliationService", () => {
  it("remaps gallery and temporary view media ids for rename events", () => {
    const { appDb, owner, galleryStore, temporaryViewStore, reconciliationService } = setup();

    const gallery = galleryStore.createGallery({
      slug: "renames",
      title: "Renames",
      description: null,
      visibility: "private",
      createdBy: owner.id,
    });

    galleryStore.addGalleryItems({
      galleryId: gallery.id,
      mediaIds: ["old-1"],
      addedBy: owner.id,
    });

    temporaryViewStore.createView({
      slug: "rename-view",
      title: "Rename View",
      visibility: "private",
      sourceType: "selection",
      sourceGalleryId: null,
      createdBy: owner.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: null,
      mediaIds: ["old-1"],
    });

    const previous = new Map<string, MediaItem>([
      ["old-1", media({ id: "old-1", relativePath: "a/original.jpg", name: "original.jpg", originalSize: 1000, createdAt: "2026-01-01T00:00:00.000Z" })],
    ]);
    const current = new Map<string, MediaItem>([
      ["new-1", media({ id: "new-1", relativePath: "a/renamed.jpg", name: "renamed.jpg", originalSize: 1000, createdAt: "2026-01-01T00:00:00.000Z" })],
    ]);

    const result = reconciliationService.reconcile({
      previousMediaById: previous,
      currentMediaById: current,
      triggerReason: "test_rename",
    });

    expect(result.summary.remapCount).toBe(1);
    expect(result.summary.unresolvedCount).toBe(0);
    expect(galleryStore.getGalleryItems(gallery.id).map((entry) => entry.mediaId)).toEqual(["new-1"]);

    const view = temporaryViewStore.getBySlug("rename-view");
    expect(view).not.toBeNull();
    expect(temporaryViewStore.getItems(view!.id).map((entry) => entry.mediaId)).toEqual(["new-1"]);

    appDb.close();
  });

  it("remaps gallery references for folder move events", () => {
    const { appDb, owner, galleryStore, reconciliationService } = setup();

    const gallery = galleryStore.createGallery({
      slug: "moves",
      title: "Moves",
      description: null,
      visibility: "private",
      createdBy: owner.id,
    });

    galleryStore.addGalleryItems({
      galleryId: gallery.id,
      mediaIds: ["old-move"],
      addedBy: owner.id,
    });

    const previous = new Map<string, MediaItem>([
      ["old-move", media({ id: "old-move", relativePath: "day1/img.jpg", name: "img.jpg", originalSize: 1200, createdAt: "2026-02-01T00:00:00.000Z" })],
    ]);
    const current = new Map<string, MediaItem>([
      ["new-move", media({ id: "new-move", relativePath: "archive/day1/img.jpg", name: "img.jpg", originalSize: 1200, createdAt: "2026-02-01T00:00:00.000Z" })],
    ]);

    const result = reconciliationService.reconcile({
      previousMediaById: previous,
      currentMediaById: current,
      triggerReason: "test_move",
    });

    expect(result.summary.remapCount).toBe(1);
    expect(galleryStore.getGalleryItems(gallery.id).map((entry) => entry.mediaId)).toEqual(["new-move"]);

    appDb.close();
  });

  it("avoids ambiguous remaps to prevent false positives", () => {
    const { appDb, owner, galleryStore, reconciliationService, reconciliationStore } = setup();

    const gallery = galleryStore.createGallery({
      slug: "ambiguous",
      title: "Ambiguous",
      description: null,
      visibility: "private",
      createdBy: owner.id,
    });

    galleryStore.addGalleryItems({
      galleryId: gallery.id,
      mediaIds: ["old-a"],
      addedBy: owner.id,
    });

    const previous = new Map<string, MediaItem>([
      ["old-a", media({ id: "old-a", relativePath: "p/one.jpg", name: "one.jpg", originalSize: 2048, createdAt: "2026-03-01T00:00:00.000Z" })],
      ["old-b", media({ id: "old-b", relativePath: "p/two.jpg", name: "two.jpg", originalSize: 2048, createdAt: "2026-03-01T00:00:00.000Z" })],
    ]);

    const current = new Map<string, MediaItem>([
      ["new-a", media({ id: "new-a", relativePath: "q/one.jpg", name: "one.jpg", originalSize: 2048, createdAt: "2026-03-01T00:00:00.000Z" })],
      ["new-b", media({ id: "new-b", relativePath: "q/two.jpg", name: "two.jpg", originalSize: 2048, createdAt: "2026-03-01T00:00:00.000Z" })],
    ]);

    const result = reconciliationService.reconcile({
      previousMediaById: previous,
      currentMediaById: current,
      triggerReason: "test_ambiguous",
    });

    expect(result.summary.remapCount).toBe(0);
    expect(result.summary.unresolvedCount).toBe(1);
    expect(galleryStore.getGalleryItems(gallery.id).map((entry) => entry.mediaId)).toEqual(["old-a"]);

    const unresolved = reconciliationStore.listActiveUnresolved();
    expect(unresolved.map((entry) => entry.mediaId)).toEqual(["old-a"]);

    appDb.close();
  });

  it("populates unresolved queue when references cannot be remapped", () => {
    const { appDb, owner, galleryStore, temporaryViewStore, reconciliationService, reconciliationStore } = setup();

    const gallery = galleryStore.createGallery({
      slug: "unresolved",
      title: "Unresolved",
      description: null,
      visibility: "private",
      createdBy: owner.id,
    });

    galleryStore.addGalleryItems({
      galleryId: gallery.id,
      mediaIds: ["missing-1"],
      addedBy: owner.id,
    });

    temporaryViewStore.createView({
      slug: "unresolved-view",
      title: "Unresolved View",
      visibility: "private",
      sourceType: "selection",
      sourceGalleryId: null,
      createdBy: owner.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      maxUses: null,
      mediaIds: ["missing-1"],
    });

    const previous = new Map<string, MediaItem>([
      ["missing-1", media({ id: "missing-1", relativePath: "x/missing.jpg", name: "missing.jpg", originalSize: 900, createdAt: "2026-04-01T00:00:00.000Z" })],
    ]);
    const current = new Map<string, MediaItem>();

    const result = reconciliationService.reconcile({
      previousMediaById: previous,
      currentMediaById: current,
      triggerReason: "test_unresolved",
    });

    expect(result.summary.remapCount).toBe(0);
    expect(result.summary.unresolvedCount).toBe(1);

    const unresolved = reconciliationStore.listActiveUnresolved();
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].mediaId).toBe("missing-1");
    expect(unresolved[0].galleryRefCount).toBe(1);
    expect(unresolved[0].viewRefCount).toBe(1);

    appDb.close();
  });
});

