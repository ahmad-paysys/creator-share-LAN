import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AuthStore } from "./auth-store";
import { AppDatabase } from "./core/database";
import { GalleryStore } from "./gallery-store";

const dirs: string[] = [];

function setup(): { appDb: AppDatabase; authStore: AuthStore; galleryStore: GalleryStore } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-gallery-store-"));
  dirs.push(dir);
  const appDb = new AppDatabase(path.join(dir, "app.db"));
  appDb.init();
  const authStore = new AuthStore(appDb.connection);
  const galleryStore = new GalleryStore(appDb.connection);
  return { appDb, authStore, galleryStore };
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("GalleryStore", () => {
  it("enforces slug uniqueness", () => {
    const { appDb, authStore, galleryStore } = setup();
    const owner = authStore.createUser({
      username: "owner",
      displayName: "Owner",
      passwordHash: "hash",
      role: "owner",
    });

    galleryStore.createGallery({
      slug: "mygallery",
      title: "My Gallery",
      description: null,
      visibility: "public",
      createdBy: owner.id,
    });

    expect(() => {
      galleryStore.createGallery({
        slug: "mygallery",
        title: "Duplicate",
        description: null,
        visibility: "public",
        createdBy: owner.id,
      });
    }).toThrow();

    appDb.close();
  });

  it("adds and removes gallery items across mixed media ids", () => {
    const { appDb, authStore, galleryStore } = setup();
    const owner = authStore.createUser({
      username: "owner",
      displayName: "Owner",
      passwordHash: "hash",
      role: "owner",
    });

    const gallery = galleryStore.createGallery({
      slug: "curated",
      title: "Curated",
      description: null,
      visibility: "private",
      createdBy: owner.id,
    });

    galleryStore.addGalleryItems({
      galleryId: gallery.id,
      mediaIds: ["a", "b", "c"],
      addedBy: owner.id,
    });

    expect(galleryStore.getGalleryItems(gallery.id).map((entry) => entry.mediaId)).toEqual(["a", "b", "c"]);

    expect(galleryStore.removeGalleryItem(gallery.id, "b")).toBe(true);
    expect(galleryStore.getGalleryItems(gallery.id).map((entry) => entry.mediaId)).toEqual(["a", "c"]);

    appDb.close();
  });
});

