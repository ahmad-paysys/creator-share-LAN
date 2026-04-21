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
import { csrfProtectionMiddleware } from "./csrf-middleware";
import { AppDatabase } from "./database";
import { registerSettingsRoutes } from "./settings-routes";
import { SettingsStore } from "./settings-store";

const COOKIE_NAME = "creator_session";
const CSRF_COOKIE_NAME = "creator_csrf";

let tempDir: string;
let appDb: AppDatabase;
let app: express.Express;
let authService: AuthService;
let settingsStore: SettingsStore;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-csrf-"));
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
  app.use(csrfProtectionMiddleware(CSRF_COOKIE_NAME));
  registerAuthRoutes(app, {
    authService,
    cookieName: COOKIE_NAME,
    csrfCookieName: CSRF_COOKIE_NAME,
  });
  registerSettingsRoutes(app, settingsStore);
});

afterEach(() => {
  appDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("csrf protection", () => {
  it("rejects authenticated mutating route with missing csrf header", async () => {
    const login = await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "VeryStrongPassword1",
    });

    const rawCookieHeader = login.headers["set-cookie"];
    const cookies = Array.isArray(rawCookieHeader)
      ? rawCookieHeader
      : typeof rawCookieHeader === "string"
        ? [rawCookieHeader]
        : [];

    const sessionCookie = cookies.find((entry) => entry.startsWith(`${COOKIE_NAME}=`))?.split(";")[0];
    expect(sessionCookie).toBeDefined();

    const response = await request(app)
      .patch("/api/admin/settings")
      .set("Cookie", sessionCookie!)
      .send({ folderViewPublic: false });

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("CSRF");
  });

  it("allows authenticated mutating route with matching csrf token", async () => {
    const login = await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "VeryStrongPassword1",
    });

    const rawCookieHeader = login.headers["set-cookie"];
    const cookies = Array.isArray(rawCookieHeader)
      ? rawCookieHeader
      : typeof rawCookieHeader === "string"
        ? [rawCookieHeader]
        : [];

    const sessionCookie = cookies.find((entry) => entry.startsWith(`${COOKIE_NAME}=`))?.split(";")[0];
    const csrfCookieRaw = cookies.find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`))?.split(";")[0];

    expect(sessionCookie).toBeDefined();
    expect(csrfCookieRaw).toBeDefined();

    const csrfToken = csrfCookieRaw!.split("=")[1];

    const response = await request(app)
      .patch("/api/admin/settings")
      .set("Cookie", [sessionCookie!, csrfCookieRaw!])
      .set("x-csrf-token", csrfToken)
      .send({ folderViewPublic: false });

    expect(response.status).toBe(200);
    expect(response.body.folderViewPublic).toBe(false);
  });
});
