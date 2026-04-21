import type { Express } from "express";
import { ReconciliationService } from "./service";
import { ReconciliationStore } from "./store";
import { requireAdmin } from "../shared/auth-guards";
import type { MediaItem } from "../types/app";

interface ReconciliationRouteDeps {
  reconciliationStore: ReconciliationStore;
  reconciliationService: ReconciliationService;
  ensureMediaFresh: () => Promise<void>;
  getCurrentMediaSnapshot: () => Map<string, MediaItem>;
  getPreviousMediaSnapshot: () => Map<string, MediaItem>;
  setPreviousMediaSnapshot: (snapshot: Map<string, MediaItem>) => void;
}

export function registerReconciliationRoutes(app: Express, deps: ReconciliationRouteDeps): void {
  app.get("/api/admin/reconciliation/unresolved", (req, res) => {
    const user = requireAdmin(req, res);
    if (!user) {
      return;
    }

    const unresolved = deps.reconciliationStore.listActiveUnresolved();
    res.json({
      unresolved,
      summary: {
        count: unresolved.length,
        totalGalleryRefs: unresolved.reduce((sum, entry) => sum + entry.galleryRefCount, 0),
        totalViewRefs: unresolved.reduce((sum, entry) => sum + entry.viewRefCount, 0),
      },
    });
  });

  app.get("/api/admin/reconciliation/runs", (req, res) => {
    const user = requireAdmin(req, res);
    if (!user) {
      return;
    }

    const limitRaw = Number(req.query.limit ?? 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 10;
    res.json({ runs: deps.reconciliationStore.listRecentRuns(limit) });
  });

  app.post("/api/admin/reconciliation/run", async (req, res) => {
    const user = requireAdmin(req, res);
    if (!user) {
      return;
    }

    await deps.ensureMediaFresh();

    const previous = deps.getPreviousMediaSnapshot();
    const current = deps.getCurrentMediaSnapshot();
    const result = deps.reconciliationService.reconcile({
      previousMediaById: previous,
      currentMediaById: current,
      triggerReason: "manual_admin",
      requestIp: req.ip ?? null,
    });

    deps.setPreviousMediaSnapshot(new Map(current));

    res.json({
      run: result.summary,
      remaps: result.remaps,
      unresolved: deps.reconciliationStore.listActiveUnresolved(),
    });
  });
}


