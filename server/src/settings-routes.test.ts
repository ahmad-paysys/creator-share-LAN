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
import { registerSettingsRoutes } from "./settings-routes";
import { SettingsStore } from "./settings-store";

const COOKIE_NAME = "creator_session";

let tempDir: string;
let appDb: AppDatabase;
let app: express.Express;
let authService: AuthService;
let settingsStore: SettingsStore;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-settings-routes-"));
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

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(authContextMiddleware(authService, COOKIE_NAME));
  registerAuthRoutes(app, { authService, cookieName: COOKIE_NAME });
  registerSettingsRoutes(app, settingsStore);
});

afterEach(() => {
  appDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("settings routes", () => {
  it("requires privileged role", async () => {
    const response = await request(app).get("/api/admin/settings");
    expect(response.status).toBe(403);
  });

  it("allows owner to read and update settings", async () => {
    const login = await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "VeryStrongPassword1",
    });

    const cookieHeader = login.headers["set-cookie"];
    const cookies = Array.isArray(cookieHeader)
      ? cookieHeader
      : typeof cookieHeader === "string"
        ? [cookieHeader]
        : [];

    const sessionCookie = cookies[0].split(";")[0];

    const before = await request(app).get("/api/admin/settings").set("Cookie", sessionCookie);
    expect(before.status).toBe(200);
    expect(before.body.libraryViewPublic).toBe(true);

    const updated = await request(app)
      .patch("/api/admin/settings")
      .set("Cookie", sessionCookie)
      .send({ libraryViewPublic: false, folderViewPublic: false });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({
      libraryViewPublic: false,
      folderViewPublic: false,
    });
  });
});
