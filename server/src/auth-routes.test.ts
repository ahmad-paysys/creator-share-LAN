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

const COOKIE_NAME = "creator_session";

let appDb: AppDatabase;
let authService: AuthService;
let app: express.Express;
let tempDir: string;

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-auth-"));
  const dbPath = path.join(tempDir, "auth.db");
  appDb = new AppDatabase(dbPath);
  appDb.init();

  const authStore = new AuthStore(appDb.connection);
  authService = new AuthService(authStore, 4);
  await authService.bootstrapOwnerIfNeeded({
    username: "owner",
    password: "VeryStrongPassword1",
    displayName: "Owner",
  });

  app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(authContextMiddleware(authService, COOKIE_NAME));
  registerAuthRoutes(app, { authService, cookieName: COOKIE_NAME });
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
});
