import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireReadAccess } from "../access/middleware";
import { AuditStore } from "./audit-store";
import { AuthService } from "../auth/service";
import { authContextMiddleware } from "../auth/middleware";
import { registerAuthRoutes } from "../auth/routes";
import { AuthStore } from "../auth/store";
import { AppDatabase } from "../core/database";
import { registerOpsRoutes } from "./routes";
import { ReconciliationStore } from "../reconciliation/store";
import { SettingsStore } from "../settings/store";
import { registerSettingsRoutes } from "../settings/routes";
import { TemporaryViewStore } from "../temporary-views/store";

const COOKIE_NAME = "creator_session";

let tempDir: string;
let appDb: AppDatabase;
let app: express.Express;
let authService: AuthService;
let authStore: AuthStore;
let settingsStore: SettingsStore;
let auditStore: AuditStore;
let temporaryViewStore: TemporaryViewStore;
let reconciliationStore: ReconciliationStore;
let ownerId = "";

beforeEach(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-ops-routes-"));
  appDb = new AppDatabase(path.join(tempDir, "app.db"));
  appDb.init();

  authStore = new AuthStore(appDb.connection);
  settingsStore = new SettingsStore(appDb.connection);
  settingsStore.ensureDefaults();
  auditStore = new AuditStore(appDb.connection);
  temporaryViewStore = new TemporaryViewStore(appDb.connection);
  reconciliationStore = new ReconciliationStore(appDb.connection);

  authService = new AuthService(authStore, 4);
  const owner = await authService.bootstrapOwnerIfNeeded({
    username: "owner",
    password: "VeryStrongPassword1",
    displayName: "Owner",
  });
  ownerId = owner!.id;

  app = express();
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(cookieParser());
  app.use(authContextMiddleware(authService, COOKIE_NAME));

  registerAuthRoutes(app, {
    authService,
    cookieName: COOKIE_NAME,
    auditStore,
  });
  registerSettingsRoutes(app, settingsStore, auditStore);

  const protectedRead = requireReadAccess(settingsStore, "folder_library", {
    onDecision: (payload) => {
      if (payload.allowed) {
        return;
      }
      auditStore.insertEvent({
        actorType: payload.userId ? "user" : "anonymous",
        actorUserId: payload.userId,
        action: "authz.denied",
        targetType: payload.resource,
        targetId: payload.path,
        result: "error",
        requestIp: payload.ip,
        meta: { reason: payload.reason },
      });
    },
  });

  app.get("/protected", protectedRead, (_req, res) => {
    res.json({ ok: true });
  });

  registerOpsRoutes(app, {
    auditStore,
    authStore,
    temporaryViewStore,
    reconciliationStore,
    defaultRetentionDays: 90,
    runRetention: (days) => {
      const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      return {
        deletedAuditEvents: auditStore.deleteOlderThan(cutoffIso),
        deletedResolvedBacklogRows: reconciliationStore.deleteResolvedOlderThan(cutoffIso),
      };
    },
  });
});

afterEach(() => {
  appDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function loginOwner(): Promise<string> {
  const login = await request(app).post("/api/auth/login").send({
    username: "owner",
    password: "VeryStrongPassword1",
  });

  const raw = login.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return cookies[0].split(";")[0];
}

describe("ops routes", () => {
  it("persists and returns key events", async () => {
    await request(app).get("/protected").set("X-Forwarded-For", "8.8.8.8");
    const ownerCookie = await loginOwner();

    await request(app)
      .patch("/api/admin/settings")
      .set("Cookie", ownerCookie)
      .send({ folderViewPublic: false, libraryViewPublic: false });

    const events = await request(app)
      .get("/api/admin/ops/events?limit=20")
      .set("Cookie", ownerCookie);

    expect(events.status).toBe(200);
    const actions = events.body.events.map((entry: { action: string }) => entry.action);
    expect(actions).toContain("authz.denied");
    expect(actions).toContain("admin.settings.update");
    expect(actions).toContain("auth.login");
  });

  it("aggregates dashboard counters accurately", async () => {
    const ownerCookie = await loginOwner();

    await request(app).get("/protected").set("X-Forwarded-For", "8.8.8.8");

    temporaryViewStore.createView({
      slug: "ops-expiring",
      title: "Ops Expiring",
      visibility: "private",
      sourceType: "selection",
      sourceGalleryId: null,
      createdBy: ownerId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      maxUses: null,
      mediaIds: ["m1"],
    });

    const runId = reconciliationStore.insertRun({
      status: "partial",
      triggerReason: "test",
      previousMediaCount: 1,
      currentMediaCount: 0,
      remapCount: 0,
      unresolvedCount: 1,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summaryJson: "{}",
    });
    reconciliationStore.upsertUnresolved(
      runId,
      [{ mediaId: "missing-1", galleryRefCount: 1, viewRefCount: 0 }],
      new Date().toISOString(),
    );

    const dashboard = await request(app)
      .get("/api/admin/ops/dashboard")
      .set("Cookie", ownerCookie);

    expect(dashboard.status).toBe(200);
    expect(dashboard.body.counters.deniedAccessLast24h).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.counters.activeSessions).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.counters.expiringTemporaryViews24h).toBe(1);
    expect(dashboard.body.counters.reconciliationBacklog).toBe(1);
  });

  it("runs retention without corruption", async () => {
    const ownerCookie = await loginOwner();

    auditStore.insertEvent({
      actorType: "system",
      action: "ops.old",
      result: "ok",
      createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    });

    auditStore.insertEvent({
      actorType: "system",
      action: "ops.new",
      result: "ok",
      createdAt: new Date().toISOString(),
    });

    const retention = await request(app)
      .post("/api/admin/ops/retention/run")
      .set("Cookie", ownerCookie)
      .send({ days: 30 });

    expect(retention.status).toBe(200);
    expect(retention.body.deletedAuditEvents).toBeGreaterThanOrEqual(1);

    const events = await request(app)
      .get("/api/admin/ops/events?limit=20")
      .set("Cookie", ownerCookie);

    const actions = events.body.events.map((entry: { action: string }) => entry.action);
    expect(actions).toContain("ops.new");
    expect(actions).not.toContain("ops.old");
  });
});


