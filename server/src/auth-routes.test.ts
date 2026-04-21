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
import { LoginThrottle } from "./login-throttle";

const COOKIE_NAME = "creator_session";

let appDb: AppDatabase;
let authService: AuthService;
let app: express.Express;
let tempDir: string;
let loginThrottle: LoginThrottle;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-auth-"));
  const dbPath = path.join(tempDir, "auth.db");
  appDb = new AppDatabase(dbPath);
  appDb.init();

  const authStore = new AuthStore(appDb.connection);
  authService = new AuthService(authStore, 4);
  loginThrottle = new LoginThrottle({
    windowSeconds: 60,
    blockSeconds: 120,
    maxAttempts: 3,
  });
  await authService.bootstrapOwnerIfNeeded({
    username: "owner",
    password: "VeryStrongPassword1",
    displayName: "Owner",
  });

  app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(authContextMiddleware(authService, COOKIE_NAME));
  registerAuthRoutes(app, {
    authService,
    cookieName: COOKIE_NAME,
    csrfCookieName: "creator_csrf",
    loginThrottle,
  });
});

afterEach(() => {
  appDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("auth routes", () => {
  it("handles login, me, logout lifecycle", async () => {
    const login = await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "VeryStrongPassword1",
    });

    expect(login.status).toBe(200);
    const rawCookieHeader = login.headers["set-cookie"];
    const cookieHeader = Array.isArray(rawCookieHeader)
      ? rawCookieHeader
      : typeof rawCookieHeader === "string"
        ? [rawCookieHeader]
        : [];
    expect(cookieHeader?.[0]).toContain(`${COOKIE_NAME}=`);

    const sessionCookie = cookieHeader[0].split(";")[0];

    const me = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("owner");

    const createdUser = await request(app)
      .post("/api/admin/users")
      .set("Cookie", sessionCookie)
      .send({
        username: "viewer1",
        password: "SomeStrongPassword2",
        role: "viewer",
      });

    expect(createdUser.status).toBe(201);
    expect(createdUser.body.user.username).toBe("viewer1");

    const listedUsers = await request(app).get("/api/admin/users").set("Cookie", sessionCookie);
    expect(listedUsers.status).toBe(200);
    expect(Array.isArray(listedUsers.body.users)).toBe(true);
    const viewerUser = listedUsers.body.users.find((user: { username: string }) => user.username === "viewer1");
    expect(viewerUser).toBeDefined();

    const promoted = await request(app)
      .patch(`/api/admin/users/${viewerUser.id}`)
      .set("Cookie", sessionCookie)
      .send({ role: "editor" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.user.role).toBe("editor");

    const logout = await request(app).post("/api/auth/logout").set("Cookie", sessionCookie);
    expect(logout.status).toBe(200);

    const meAfterLogout = await request(app).get("/api/auth/me").set("Cookie", sessionCookie);
    expect(meAfterLogout.status).toBe(401);
  });

  it("does not expose self-signup endpoint", async () => {
    const response = await request(app).post("/api/auth/signup").send({
      username: "somebody",
      password: "Password1234",
    });

    expect(response.status).toBe(404);
  });

  it("enforces admin role assignment guardrails", async () => {
    const ownerLogin = await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "VeryStrongPassword1",
    });

    const ownerCookieRaw = ownerLogin.headers["set-cookie"];
    const ownerCookie = Array.isArray(ownerCookieRaw)
      ? ownerCookieRaw[0].split(";")[0]
      : String(ownerCookieRaw).split(";")[0];

    const adminUser = await request(app)
      .post("/api/admin/users")
      .set("Cookie", ownerCookie)
      .send({
        username: "admin1",
        password: "VeryStrongPassword2",
        role: "admin",
      });

    const viewerUser = await request(app)
      .post("/api/admin/users")
      .set("Cookie", ownerCookie)
      .send({
        username: "viewer2",
        password: "VeryStrongPassword3",
        role: "viewer",
      });

    const adminLogin = await request(app).post("/api/auth/login").send({
      username: "admin1",
      password: "VeryStrongPassword2",
    });

    const adminCookieRaw = adminLogin.headers["set-cookie"];
    const adminCookie = Array.isArray(adminCookieRaw)
      ? adminCookieRaw[0].split(";")[0]
      : String(adminCookieRaw).split(";")[0];

    const cannotPromoteOwner = await request(app)
      .patch(`/api/admin/users/${adminUser.body.user.id}`)
      .set("Cookie", adminCookie)
      .send({ role: "owner" });

    expect(cannotPromoteOwner.status).toBe(400);

    const cannotDemoteOwner = await request(app)
      .patch(`/api/admin/users/${ownerLogin.body.user.id}`)
      .set("Cookie", ownerCookie)
      .send({ role: "admin" });

    expect(cannotDemoteOwner.status).toBe(400);

    const adminCanPromoteViewer = await request(app)
      .patch(`/api/admin/users/${viewerUser.body.user.id}`)
      .set("Cookie", adminCookie)
      .send({ role: "editor" });

    expect(adminCanPromoteViewer.status).toBe(200);
    expect(adminCanPromoteViewer.body.user.role).toBe("editor");
  });

  it("throttles repeated failed login attempts", async () => {
    await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "WrongPassword1",
    });
    await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "WrongPassword2",
    });
    await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "WrongPassword3",
    });

    const throttled = await request(app).post("/api/auth/login").send({
      username: "owner",
      password: "VeryStrongPassword1",
    });

    expect(throttled.status).toBe(429);
    expect(throttled.headers["retry-after"]).toBeDefined();
  });
});
