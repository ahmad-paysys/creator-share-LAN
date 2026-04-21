import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireReadAccess } from "./middleware";
import { AuthService } from "../auth/service";
import { authContextMiddleware } from "../auth/middleware";
import { registerAuthRoutes } from "../auth/routes";
import { AuthStore } from "../auth/store";
import { AppDatabase } from "../core/database";
import { SettingsStore } from "../settings/store";

const COOKIE_NAME = "creator_session";

let tempDir: string;
let appDb: AppDatabase;
let app: express.Express;
let authService: AuthService;
let settingsStore: SettingsStore;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-existing-routes-authz-"));
  appDb = new AppDatabase(path.join(tempDir, "app.db"));
  appDb.init();

  const authStore = new AuthStore(appDb.connection);
  settingsStore = new SettingsStore(appDb.connection);
  settingsStore.ensureDefaults();

  authService = new AuthService(authStore, 4);
  await authService.bootstrapOwnerIfNeeded({
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

  app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(cookieParser());
  app.use(authContextMiddleware(authService, COOKIE_NAME));
  registerAuthRoutes(app, { authService, cookieName: COOKIE_NAME });

  const requireLibraryReadAccess = requireReadAccess(settingsStore, "folder_library");

  app.get("/api/folders", requireLibraryReadAccess, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/api/folders/:folderId/media", requireLibraryReadAccess, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/thumbnails/:thumbFile", requireLibraryReadAccess, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/media/:mediaId/original", requireLibraryReadAccess, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.get("/media/:mediaId/resized", requireLibraryReadAccess, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post("/api/download", requireLibraryReadAccess, (_req, res) => {
    res.status(200).json({ ok: true });
  });
});

afterEach(() => {
  appDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loginViewer(): Promise<string> {
  const response = await request(app).post("/api/auth/login").send({
    username: "viewer",
    password: "VeryStrongPassword2",
  });

  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return cookies[0].split(";")[0];
}

describe("existing media and download route protections", () => {
  it("blocks direct URL access for anonymous non-LAN requests", async () => {
    const targets: Array<{ method: "get" | "post"; url: string }> = [
      { method: "get", url: "/thumbnails/abc.jpg" },
      { method: "get", url: "/media/m1/original" },
      { method: "get", url: "/media/m1/resized" },
      { method: "post", url: "/api/download" },
    ];

    for (const target of targets) {
      const req = target.method === "get" ? request(app).get(target.url) : request(app).post(target.url).send({});
      const response = await req.set("X-Forwarded-For", "8.8.8.8");
      expect(response.status).toBe(403);
      expect(response.body.reason).toBe("DENY_NON_LAN_ANONYMOUS");
    }
  });

  it("honors private visibility settings across folder, media, and download endpoints", async () => {
    settingsStore.updateVisibilitySettings({
      folderViewPublic: false,
      libraryViewPublic: false,
    });

    const targets: Array<{ method: "get" | "post"; url: string }> = [
      { method: "get", url: "/api/folders" },
      { method: "get", url: "/api/folders/f1/media" },
      { method: "get", url: "/thumbnails/abc.jpg" },
      { method: "get", url: "/media/m1/original" },
      { method: "get", url: "/media/m1/resized" },
      { method: "post", url: "/api/download" },
    ];

    for (const target of targets) {
      const req = target.method === "get" ? request(app).get(target.url) : request(app).post(target.url).send({});
      const response = await req.set("X-Forwarded-For", "192.168.1.14");
      expect(response.status).toBe(401);
      expect(response.body.reason).toBe("DENY_PRIVATE_SETTING");
    }
  });

  it("keeps view and download permissions in parity for authenticated viewers", async () => {
    settingsStore.updateVisibilitySettings({
      folderViewPublic: false,
      libraryViewPublic: false,
    });

    const viewerCookie = await loginViewer();

    const folderRead = await request(app).get("/api/folders").set("Cookie", viewerCookie);
    expect(folderRead.status).toBe(200);
    expect(folderRead.headers["x-authz-reason"]).toBe("ALLOW_VIEWER");

    const mediaRead = await request(app).get("/media/m1/original").set("Cookie", viewerCookie);
    expect(mediaRead.status).toBe(200);
    expect(mediaRead.headers["x-authz-reason"]).toBe("ALLOW_VIEWER");

    const downloadRead = await request(app).post("/api/download").set("Cookie", viewerCookie).send({});
    expect(downloadRead.status).toBe(200);
    expect(downloadRead.headers["x-authz-reason"]).toBe("ALLOW_VIEWER");
  });
});


