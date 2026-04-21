import type { Express } from "express";
import { AuditStore } from "./audit-store";
import { AuthStore } from "./auth/store";
import { ReconciliationStore } from "./reconciliation-store";
import { requireAdmin } from "./shared/auth-guards";
import { TemporaryViewStore } from "./temporary-view-store";

interface OpsRouteDeps {
  auditStore: AuditStore;
  authStore: AuthStore;
  temporaryViewStore: TemporaryViewStore;
  reconciliationStore: ReconciliationStore;
  defaultRetentionDays: number;
  runRetention: (days: number) => { deletedAuditEvents: number; deletedResolvedBacklogRows: number };
}

export function registerOpsRoutes(app: Express, deps: OpsRouteDeps): void {
  app.get("/api/admin/ops/dashboard", (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const plus24hIso = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const last24hIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    res.json({
      counters: {
        deniedAccessLast24h: deps.auditStore.countByActionSince("authz.denied", last24hIso),
        activeSessions: deps.authStore.countActiveSessions(nowIso),
        sessionsExpiring24h: deps.authStore.countSessionsExpiringBefore(plus24hIso, nowIso),
        expiringTemporaryViews24h: deps.temporaryViewStore.countExpiringBetween(nowIso, plus24hIso),
        reconciliationBacklog: deps.reconciliationStore.countActiveUnresolved(),
      },
      generatedAt: nowIso,
    });
  });

  app.get("/api/admin/ops/events", (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 50;
    res.json({ events: deps.auditStore.listRecent(limit) });
  });

  app.post("/api/admin/ops/retention/run", (req, res) => {
    if (!requireAdmin(req, res)) {
      return;
    }

    const requestedDays = Number(req.body?.days ?? deps.defaultRetentionDays);
    const days = Number.isFinite(requestedDays)
      ? Math.max(1, Math.min(3650, Math.floor(requestedDays)))
      : deps.defaultRetentionDays;

    const result = deps.runRetention(days);
    deps.auditStore.insertEvent({
      actorType: "user",
      actorUserId: req.auth?.user?.id ?? null,
      action: "ops.retention.run",
      targetType: "retention",
      targetId: null,
      result: "ok",
      meta: {
        days,
        deletedAuditEvents: result.deletedAuditEvents,
        deletedResolvedBacklogRows: result.deletedResolvedBacklogRows,
      },
      requestIp: req.ip ?? null,
    });

    res.json({
      days,
      deletedAuditEvents: result.deletedAuditEvents,
      deletedResolvedBacklogRows: result.deletedResolvedBacklogRows,
    });
  });
}


