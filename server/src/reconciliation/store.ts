import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
  BrokenMediaReference,
  ReconciliationRecentRun,
  ReconciliationRunSummary,
  ReconciliationUnresolvedRecord,
} from "./types";

export class ReconciliationStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public applyMediaIdRemap(oldMediaId: string, newMediaId: string): {
    galleryRowsUpdated: number;
    viewRowsUpdated: number;
  } {
    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `DELETE FROM gallery_items
           WHERE media_id = ?
             AND EXISTS (
               SELECT 1 FROM gallery_items existing
               WHERE existing.gallery_id = gallery_items.gallery_id
                 AND existing.media_id = ?
             )`,
        )
        .run(oldMediaId, newMediaId);

      const galleryUpdate = this.db
        .prepare("UPDATE gallery_items SET media_id = ? WHERE media_id = ?")
        .run(newMediaId, oldMediaId);

      this.db
        .prepare(
          `DELETE FROM share_view_items
           WHERE media_id = ?
             AND EXISTS (
               SELECT 1 FROM share_view_items existing
               WHERE existing.share_view_id = share_view_items.share_view_id
                 AND existing.media_id = ?
             )`,
        )
        .run(oldMediaId, newMediaId);

      const viewUpdate = this.db
        .prepare("UPDATE share_view_items SET media_id = ? WHERE media_id = ?")
        .run(newMediaId, oldMediaId);

      return {
        galleryRowsUpdated: galleryUpdate.changes,
        viewRowsUpdated: viewUpdate.changes,
      };
    });

    return tx();
  }

  public getBrokenReferences(existingMediaIds: Set<string>): BrokenMediaReference[] {
    const rows = this.db
      .prepare(
        `SELECT media_id, SUM(gallery_refs) as gallery_ref_count, SUM(view_refs) as view_ref_count
         FROM (
           SELECT media_id, COUNT(*) as gallery_refs, 0 as view_refs
           FROM gallery_items
           GROUP BY media_id
           UNION ALL
           SELECT media_id, 0 as gallery_refs, COUNT(*) as view_refs
           FROM share_view_items
           GROUP BY media_id
         )
         GROUP BY media_id`,
      )
      .all() as Array<{
      media_id: string;
      gallery_ref_count: number;
      view_ref_count: number;
    }>;

    return rows
      .filter((row) => !existingMediaIds.has(row.media_id))
      .map((row) => ({
        mediaId: row.media_id,
        galleryRefCount: Number(row.gallery_ref_count),
        viewRefCount: Number(row.view_ref_count),
      }));
  }

  public insertRun(input: {
    status: "success" | "partial" | "failed";
    triggerReason: string;
    previousMediaCount: number;
    currentMediaCount: number;
    remapCount: number;
    unresolvedCount: number;
    startedAt: string;
    completedAt: string;
    summaryJson: string;
  }): string {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO reconciliation_runs(
          id, status, trigger_reason, previous_media_count, current_media_count,
          remap_count, unresolved_count, started_at, completed_at, summary_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.status,
        input.triggerReason,
        input.previousMediaCount,
        input.currentMediaCount,
        input.remapCount,
        input.unresolvedCount,
        input.startedAt,
        input.completedAt,
        input.summaryJson,
      );

    return id;
  }

  public insertRemap(input: {
    runId: string;
    oldMediaId: string;
    newMediaId: string;
    reason: string;
    confidence: number;
    createdAt: string;
  }): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO media_id_remaps(
          id, run_id, old_media_id, new_media_id, reason, confidence, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.runId,
        input.oldMediaId,
        input.newMediaId,
        input.reason,
        input.confidence,
        input.createdAt,
      );
  }

  public upsertUnresolved(runId: string, unresolved: BrokenMediaReference[], nowIso: string): void {
    const upsert = this.db.prepare(
      `INSERT INTO reconciliation_unresolved(
        media_id, first_seen_at, last_seen_at, occurrences,
        gallery_ref_count, view_ref_count, last_run_id, resolved_at, resolution_note
      ) VALUES (?, ?, ?, 1, ?, ?, ?, NULL, NULL)
      ON CONFLICT(media_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        occurrences = reconciliation_unresolved.occurrences + 1,
        gallery_ref_count = excluded.gallery_ref_count,
        view_ref_count = excluded.view_ref_count,
        last_run_id = excluded.last_run_id,
        resolved_at = NULL,
        resolution_note = NULL`,
    );

    for (const entry of unresolved) {
      upsert.run(
        entry.mediaId,
        nowIso,
        nowIso,
        entry.galleryRefCount,
        entry.viewRefCount,
        runId,
      );
    }
  }

  public resolveMissingUnresolved(activeMediaIds: Set<string>, runId: string, nowIso: string): void {
    const unresolvedRows = this.db
      .prepare("SELECT media_id FROM reconciliation_unresolved WHERE resolved_at IS NULL")
      .all() as Array<{ media_id: string }>;

    const toResolve = unresolvedRows
      .map((row) => row.media_id)
      .filter((mediaId) => activeMediaIds.has(mediaId));

    if (toResolve.length === 0) {
      return;
    }

    const placeholders = toResolve.map(() => "?").join(", ");
    this.db
      .prepare(
        `UPDATE reconciliation_unresolved
         SET resolved_at = ?, resolution_note = ?, last_run_id = ?
         WHERE media_id IN (${placeholders})`,
      )
      .run(nowIso, "resolved_by_reappearance", runId, ...toResolve);
  }

  public listActiveUnresolved(): ReconciliationUnresolvedRecord[] {
    const rows = this.db
      .prepare(
        `SELECT media_id, first_seen_at, last_seen_at, occurrences,
                gallery_ref_count, view_ref_count, last_run_id, resolved_at, resolution_note
         FROM reconciliation_unresolved
         WHERE resolved_at IS NULL
         ORDER BY last_seen_at DESC`,
      )
      .all() as Array<{
      media_id: string;
      first_seen_at: string;
      last_seen_at: string;
      occurrences: number;
      gallery_ref_count: number;
      view_ref_count: number;
      last_run_id: string | null;
      resolved_at: string | null;
      resolution_note: string | null;
    }>;

    return rows.map((row) => ({
      mediaId: row.media_id,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      occurrences: Number(row.occurrences),
      galleryRefCount: Number(row.gallery_ref_count),
      viewRefCount: Number(row.view_ref_count),
      lastRunId: row.last_run_id,
      resolvedAt: row.resolved_at,
      resolutionNote: row.resolution_note,
    }));
  }

  public listRecentRuns(limit: number): ReconciliationRecentRun[] {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const rows = this.db
      .prepare(
        `SELECT id, status, trigger_reason, previous_media_count, current_media_count,
                remap_count, unresolved_count, started_at, completed_at, summary_json
         FROM reconciliation_runs
         ORDER BY completed_at DESC
         LIMIT ?`,
      )
      .all(safeLimit) as Array<{
      id: string;
      status: "success" | "partial" | "failed";
      trigger_reason: string;
      previous_media_count: number;
      current_media_count: number;
      remap_count: number;
      unresolved_count: number;
      started_at: string;
      completed_at: string;
      summary_json: string | null;
    }>;

    return rows.map((row) => ({
      runId: row.id,
      status: row.status,
      triggerReason: row.trigger_reason,
      previousMediaCount: Number(row.previous_media_count),
      currentMediaCount: Number(row.current_media_count),
      remapCount: Number(row.remap_count),
      unresolvedCount: Number(row.unresolved_count),
      startedAt: row.started_at,
      completedAt: row.completed_at,
      summaryJson: row.summary_json,
    }));
  }

  public countActiveUnresolved(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM reconciliation_unresolved WHERE resolved_at IS NULL")
      .get() as { count: number };

    return Number(row.count);
  }

  public deleteResolvedOlderThan(cutoffIso: string): number {
    const result = this.db
      .prepare("DELETE FROM reconciliation_unresolved WHERE resolved_at IS NOT NULL AND resolved_at < ?")
      .run(cutoffIso);

    return result.changes;
  }

  public insertAuditEvent(input: {
    action: string;
    targetType: string;
    targetId: string | null;
    result: "ok" | "error";
    meta: Record<string, unknown>;
    requestIp: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO audit_events(
          id, actor_user_id, actor_type, action, target_type, target_id,
          result, meta_json, created_at, request_ip
        ) VALUES (?, NULL, 'system', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.action,
        input.targetType,
        input.targetId,
        input.result,
        JSON.stringify(input.meta),
        new Date().toISOString(),
        input.requestIp,
      );
  }

  public getRunById(runId: string): ReconciliationRunSummary | null {
    const row = this.db
      .prepare(
        `SELECT id, status, trigger_reason, previous_media_count, current_media_count,
                remap_count, unresolved_count, started_at, completed_at
         FROM reconciliation_runs
         WHERE id = ?`,
      )
      .get(runId) as
      | {
          id: string;
          status: "success" | "partial" | "failed";
          trigger_reason: string;
          previous_media_count: number;
          current_media_count: number;
          remap_count: number;
          unresolved_count: number;
          started_at: string;
          completed_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      runId: row.id,
      status: row.status,
      triggerReason: row.trigger_reason,
      previousMediaCount: Number(row.previous_media_count),
      currentMediaCount: Number(row.current_media_count),
      remapCount: Number(row.remap_count),
      unresolvedCount: Number(row.unresolved_count),
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }
}


