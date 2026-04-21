import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireReadAccess } from "./middleware";
import { SettingsStore } from "../settings/store";

function makeApp(options: {
  settings: { folderViewPublic: boolean; libraryViewPublic: boolean };
  userRole?: "owner" | "admin" | "editor" | "viewer";
}) {
  const app = express();
  app.set("trust proxy", true);
  const store = {
    getVisibilitySettings: () => options.settings,
  } as SettingsStore;

  app.use((req, _res, next) => {
    req.auth = {
      sessionToken: null,
      user: options.userRole
        ? {
            id: "u1",
            username: "user",
            displayName: null,
            role: options.userRole,
          }
        : null,
    };
    next();
  });

  app.get("/test", requireReadAccess(store, "folder_library"), (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe("requireReadAccess middleware", () => {
  it("returns reason code when denying anonymous non-LAN", async () => {
    const app = makeApp({
      settings: { folderViewPublic: true, libraryViewPublic: true },
    });

    const response = await request(app).get("/test").set("X-Forwarded-For", "8.8.8.8");
    expect(response.status).toBe(403);
    expect(response.body.reason).toBe("DENY_NON_LAN_ANONYMOUS");
    expect(response.headers["x-authz-reason"]).toBe("DENY_NON_LAN_ANONYMOUS");
  });

  it("allows authenticated viewer even when settings are private", async () => {
    const app = makeApp({
      settings: { folderViewPublic: false, libraryViewPublic: false },
      userRole: "viewer",
    });

    const response = await request(app).get("/test");
    expect(response.status).toBe(200);
    expect(response.headers["x-authz-reason"]).toBe("ALLOW_VIEWER");
  });
});


