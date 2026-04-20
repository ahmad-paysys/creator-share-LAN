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
import type { MediaItem } from "./types";

const COOKIE_NAME = "creator_session";

let tempDir: string;
let appDb: AppDatabase;
let app: express.Express;
let authService: AuthService;
let authStore: AuthStore;
let galleryStore: GalleryStore;
const mediaById = new Map<string, MediaItem>();

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-gallery-routes-"));
  appDb = new AppDatabase(path.join(tempDir, "app.db"));
  appDb.init();

  authStore = new AuthStore(appDb.connection);
  galleryStore = new GalleryStore(appDb.connection);
  authService = new AuthService(authStore, 4);

  await authService.bootstrapOwnerIfNeeded({
    username: "owner",
    password: "VeryStrongPassword1",
    displayName: "Owner",
  });

  await authService.createUser({
    username: "viewerA",
    password: "StrongPassword2",
    displayName: "Viewer",
    role: "viewer",
  });

  mediaById.clear();
  mediaById.set("m1", {
    id: "m1",
    folderId: "f1",
    relativePath: "events/day1/img1.jpg",
    absolutePath: "C:/media/events/day1/img1.jpg",
    name: "img1.jpg",
    type: "image",
    originalSize: 100,
    thumbnailUrl: "/thumbnails/m1.jpg",
    createdAt: new Date().toISOString(),
  });
  mediaById.set("m2", {
    id: "m2",
    folderId: "f2",
    relativePath: "events/day2/img2.jpg",
    absolutePath: "C:/media/events/day2/img2.jpg",
    name: "img2.jpg",
    type: "image",
    originalSize: 120,
    thumbnailUrl: "/thumbnails/m2.jpg",
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
});

afterEach(() => {
  appDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function login(username: string, password: string): Promise<string> {
  const response = await request(app).post("/api/auth/login").send({ username, password });
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return cookies[0].split(";")[0];
}

describe("gallery routes", () => {
  it("supports gallery creation and cross-folder item curation", async () => {
    const ownerCookie = await login("owner", "VeryStrongPassword1");

    const created = await request(app)
      .post("/api/galleries")
      .set("Cookie", ownerCookie)
      .send({
        slug: "wedding-best",
        title: "Wedding Best",
        visibility: "public",
      });

    expect(created.status).toBe(201);

    const added = await request(app)
      .post("/api/gallery/wedding-best/items")
      .set("Cookie", ownerCookie)
      .send({ mediaIds: ["m1", "m2"] });

    expect(added.status).toBe(200);
    expect(added.body.gallery.items.map((item: MediaItem) => item.id)).toEqual(["m1", "m2"]);
  });

  it("enforces private gallery access and supports role and user shares", async () => {
    const ownerCookie = await login("owner", "VeryStrongPassword1");
    const viewerCookie = await login("viewerA", "StrongPassword2");

    await request(app)
      .post("/api/galleries")
      .set("Cookie", ownerCookie)
      .send({
        slug: "private-picks",
        title: "Private Picks",
        visibility: "private",
      });

    const anonDenied = await request(app).get("/api/gallery/private-picks").set("X-Forwarded-For", "192.168.1.11");
    expect(anonDenied.status).toBe(401);

    const viewerDenied = await request(app).get("/api/gallery/private-picks").set("Cookie", viewerCookie);
    expect(viewerDenied.status).toBe(403);

    const shared = await request(app)
      .patch("/api/gallery/private-picks/access")
      .set("Cookie", ownerCookie)
      .send({ roleShares: ["viewer"], userShares: ["viewerA"] });

    expect(shared.status).toBe(200);

    const viewerAllowed = await request(app).get("/api/gallery/private-picks").set("Cookie", viewerCookie);
    expect(viewerAllowed.status).toBe(200);

    const anonPublicBlockedOffLan = await request(app)
      .post("/api/galleries")
      .set("Cookie", ownerCookie)
      .send({ slug: "public-lan", title: "Public LAN", visibility: "public" });
    expect(anonPublicBlockedOffLan.status).toBe(201);

    const publicOffLanDenied = await request(app)
      .get("/api/gallery/public-lan")
      .set("X-Forwarded-For", "8.8.8.8");

    expect(publicOffLanDenied.status).toBe(403);
  });
});
