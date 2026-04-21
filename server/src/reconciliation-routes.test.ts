import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthService } from "./auth/service";
import { authContextMiddleware } from "./auth/middleware";
import { registerAuthRoutes } from "./auth/routes";
import { AuthStore } from "./auth/store";
import { AppDatabase } from "./core/database";
import { GalleryStore } from "./gallery/store";
import { registerReconciliationRoutes } from "./reconciliation-routes";
import { ReconciliationService } from "./reconciliation-service";
import { ReconciliationStore } from "./reconciliation-store";
import { TemporaryViewStore } from "./temporary-views/store";
import type { MediaItem } from "./types/app";

const COOKIE_NAME = "creator_session";

let tempDir: string;
let appDb: AppDatabase;
let app: express.Express;
let authService: AuthService;
let previousMedia = new Map<string, MediaItem>();
let currentMedia = new Map<string, MediaItem>();
let galleryStore: GalleryStore;
let temporaryViewStore: TemporaryViewStore;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-reconcile-routes-"));
  appDb = new AppDatabase(path.join(tempDir, "app.db"));
  appDb.init();

  const authStore = new AuthStore(appDb.connection);
  galleryStore = new GalleryStore(appDb.connection);
  temporaryViewStore = new TemporaryViewStore(appDb.connection);
  const reconciliationStore = new ReconciliationStore(appDb.connection);
  const reconciliationService = new ReconciliationService(reconciliationStore);

  authService = new AuthService(authStore, 4);

  const owner = await authService.bootstrapOwnerIfNeeded({
    username: "owner",
    password: "VeryStrongPassword1",
    displayName: "Owner",
  });

  await authService.createUser({
    username: "viewer",
    password: "VeryStrongPassword2",
    displayName: "Viewer",
    role: "viewer",
  });

  const gallery = galleryStore.createGallery({
    slug: "ops",
    title: "Ops",
    description: null,
    visibility: "private",
    createdBy: owner!.id,
  });

  galleryStore.addGalleryItems({
    galleryId: gallery.id,
    mediaIds: ["legacy-1"],
    addedBy: owner!.id,
  });

  temporaryViewStore.createView({
    slug: "ops-view",
    title: "Ops View",
    visibility: "private",
    sourceType: "selection",
    sourceGalleryId: null,
    createdBy: owner!.id,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    maxUses: null,
    mediaIds: ["legacy-1"],
  });

  previousMedia = new Map([
    [
      "legacy-1",
      {
        id: "legacy-1",
        folderId: "f1",
        relativePath: "old/a.jpg",
        absolutePath: "C:/media/old/a.jpg",
        name: "a.jpg",
        type: "image",
        originalSize: 100,
        thumbnailUrl: "/thumbnails/legacy-1.jpg",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  ]);

  currentMedia = new Map();

  app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(cookieParser());
  app.use(authContextMiddleware(authService, COOKIE_NAME));
  registerAuthRoutes(app, { authService, cookieName: COOKIE_NAME });
  registerReconciliationRoutes(app, {
    reconciliationStore,
    reconciliationService,
    ensureMediaFresh: async () => undefined,
    getCurrentMediaSnapshot: () => new Map(currentMedia.entries()),
    getPreviousMediaSnapshot: () => new Map(previousMedia.entries()),
    setPreviousMediaSnapshot: (snapshot) => {
      previousMedia = new Map(snapshot.entries());
    },
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

describe("reconciliation routes", () => {
  it("allows owner to run reconciliation and inspect unresolved queue", async () => {
    const ownerCookie = await login("owner", "VeryStrongPassword1");

    const run = await request(app).post("/api/admin/reconciliation/run").set("Cookie", ownerCookie);
    expect(run.status).toBe(200);
    expect(run.body.run.unresolvedCount).toBe(1);

    const unresolved = await request(app)
      .get("/api/admin/reconciliation/unresolved")
      .set("Cookie", ownerCookie);

    expect(unresolved.status).toBe(200);
    expect(unresolved.body.summary.count).toBe(1);
    expect(unresolved.body.unresolved[0].mediaId).toBe("legacy-1");
  });

  it("denies non-admin users from reconciliation admin endpoints", async () => {
    const viewerCookie = await login("viewer", "VeryStrongPassword2");

    const response = await request(app)
      .get("/api/admin/reconciliation/unresolved")
      .set("Cookie", viewerCookie);

    expect(response.status).toBe(403);
  });
});


