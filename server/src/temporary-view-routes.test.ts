import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "./auth-service";
import { authContextMiddleware } from "./auth-middleware";
import { registerAuthRoutes } from "./auth-routes";
import { AuthStore } from "./auth-store";
import { AppDatabase } from "./database";
import { GalleryStore } from "./gallery-store";
import { registerGalleryRoutes } from "./gallery-routes";
import { registerTemporaryViewRoutes } from "./temporary-view-routes";
import { TemporaryViewStore } from "./temporary-view-store";
import type { MediaItem } from "./types";

const COOKIE_NAME = "creator_session";

let tempDir: string;
let appDb: AppDatabase;
let app: express.Express;
let authService: AuthService;
let authStore: AuthStore;
let galleryStore: GalleryStore;
let viewStore: TemporaryViewStore;
const mediaById = new Map<string, MediaItem>();

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-temp-view-routes-"));
  appDb = new AppDatabase(path.join(tempDir, "app.db"));
  appDb.init();

  authStore = new AuthStore(appDb.connection);
  galleryStore = new GalleryStore(appDb.connection);
  viewStore = new TemporaryViewStore(appDb.connection);
  authService = new AuthService(authStore, 4);

  await authService.bootstrapOwnerIfNeeded({
    username: "owner",
    password: "VeryStrongPassword1",
    displayName: "Owner",
  });

  mediaById.clear();
  mediaById.set("m1", {
    id: "m1",
    folderId: "f1",
    relativePath: "events/a.jpg",
    absolutePath: "C:/media/events/a.jpg",
    name: "a.jpg",
    type: "image",
    originalSize: 100,
    thumbnailUrl: "/thumbnails/m1.jpg",
    createdAt: new Date().toISOString(),
  });

  app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(cookieParser());
  app.use(authContextMiddleware(authService, COOKIE_NAME));
  registerAuthRoutes(app, { authService, cookieName: COOKIE_NAME });
  registerGalleryRoutes(app, {
    galleryStore,
    authStore,
    ensureMediaFresh: async () => undefined,
    getMediaById: (id) => mediaById.get(id),
  });
  registerTemporaryViewRoutes(app, {
    temporaryViewStore: viewStore,
    galleryStore,
    authStore,
    ensureMediaFresh: async () => undefined,
    getMediaById: (id) => mediaById.get(id),
    defaultExpiryHours: 24,
  });
});

afterEach(() => {
  appDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loginOwner(): Promise<string> {
  const response = await request(app).post("/api/auth/login").send({
    username: "owner",
    password: "VeryStrongPassword1",
  });

  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return cookies[0].split(";")[0];
}

describe("temporary view routes", () => {
  it("creates selection-based temporary view and resolves it", async () => {
    const cookie = await loginOwner();

    const created = await request(app)
      .post("/api/views")
      .set("Cookie", cookie)
      .send({
        slug: "temp-public",
        title: "Temp Public",
        visibility: "public",
        expiresInHours: 2,
        mediaIds: ["m1"],
      });

    expect(created.status).toBe(201);

    const read = await request(app).get("/api/view/temp-public").set("X-Forwarded-For", "192.168.1.20");
    expect(read.status).toBe(200);
    expect(read.body.view.items[0].id).toBe("m1");
  });

  it("enforces private access and expiry/revoke lifecycle", async () => {
    const cookie = await loginOwner();

    const created = await request(app)
      .post("/api/views")
      .set("Cookie", cookie)
      .send({
        slug: "temp-private",
        title: "Temp Private",
        visibility: "private",
        expiresInHours: 1,
        mediaIds: ["m1"],
      });

    expect(created.status).toBe(201);

    const anonDenied = await request(app).get("/api/view/temp-private").set("X-Forwarded-For", "192.168.1.20");
    expect(anonDenied.status).toBe(401);

    const revoke = await request(app).post("/api/view/temp-private/revoke").set("Cookie", cookie);
    expect(revoke.status).toBe(200);

    const revokedRead = await request(app).get("/api/view/temp-private").set("Cookie", cookie);
    expect(revokedRead.status).toBe(410);
  });
});
