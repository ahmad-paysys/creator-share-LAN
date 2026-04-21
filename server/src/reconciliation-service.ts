import type { MediaItem } from "./types/app";
import { ReconciliationStore } from "./reconciliation-store";
import type { ReconciliationRemapRecord, ReconciliationRunSummary } from "./reconciliation-types";

function makeFingerprint(media: MediaItem): string {
  const createdAtMs = Date.parse(media.createdAt);
  const stableTimestamp = Number.isFinite(createdAtMs) ? createdAtMs : media.createdAt;
  return `${media.type}|${media.originalSize}|${stableTimestamp}`;
}

export class ReconciliationService {
  private store: ReconciliationStore;

  constructor(store: ReconciliationStore) {
    this.store = store;
  }

  public reconcile(input: {
    previousMediaById: Map<string, MediaItem>;
    currentMediaById: Map<string, MediaItem>;
    triggerReason: string;
    requestIp?: string | null;
  }): {
    summary: ReconciliationRunSummary;
    remaps: ReconciliationRemapRecord[];
  } {
    const startedAt = new Date().toISOString();

    const previousIds = new Set(input.previousMediaById.keys());
    const currentIds = new Set(input.currentMediaById.keys());

    const removed: MediaItem[] = [];
    const added: MediaItem[] = [];

    for (const [mediaId, media] of input.previousMediaById.entries()) {
      if (!currentIds.has(mediaId)) {
        removed.push(media);
      }
    }

    for (const [mediaId, media] of input.currentMediaById.entries()) {
      if (!previousIds.has(mediaId)) {
        added.push(media);
      }
    }

    const removedByFingerprint = new Map<string, MediaItem[]>();
    const addedByFingerprint = new Map<string, MediaItem[]>();

    for (const media of removed) {
      const key = makeFingerprint(media);
      const existing = removedByFingerprint.get(key) ?? [];
      existing.push(media);
      removedByFingerprint.set(key, existing);
    }

    for (const media of added) {
      const key = makeFingerprint(media);
      const existing = addedByFingerprint.get(key) ?? [];
      existing.push(media);
      addedByFingerprint.set(key, existing);
    }

    const remaps: ReconciliationRemapRecord[] = [];

    for (const [fingerprint, oldCandidates] of removedByFingerprint.entries()) {
      const newCandidates = addedByFingerprint.get(fingerprint) ?? [];
      if (oldCandidates.length !== 1 || newCandidates.length !== 1) {
        continue;
      }

      const oldMedia = oldCandidates[0];
      const newMedia = newCandidates[0];
      if (oldMedia.id === newMedia.id) {
        continue;
      }

      const applied = this.store.applyMediaIdRemap(oldMedia.id, newMedia.id);
      if (applied.galleryRowsUpdated === 0 && applied.viewRowsUpdated === 0) {
        continue;
      }

      remaps.push({
        oldMediaId: oldMedia.id,
        newMediaId: newMedia.id,
        reason: "fingerprint_unique_match",
        confidence: 1,
        galleryRowsUpdated: applied.galleryRowsUpdated,
        viewRowsUpdated: applied.viewRowsUpdated,
      });
    }

    const nowIso = new Date().toISOString();
    const unresolved = this.store.getBrokenReferences(currentIds);

    const status = unresolved.length > 0 ? "partial" : "success";
    const runId = this.store.insertRun({
      status,
      triggerReason: input.triggerReason,
      previousMediaCount: input.previousMediaById.size,
      currentMediaCount: input.currentMediaById.size,
      remapCount: remaps.length,
      unresolvedCount: unresolved.length,
      startedAt,
      completedAt: nowIso,
      summaryJson: JSON.stringify({
        removedCount: removed.length,
        addedCount: added.length,
      }),
    });

    for (const remap of remaps) {
      this.store.insertRemap({
        runId,
        oldMediaId: remap.oldMediaId,
        newMediaId: remap.newMediaId,
        reason: remap.reason,
        confidence: remap.confidence,
        createdAt: nowIso,
      });

      this.store.insertAuditEvent({
        action: "reconciliation.remap",
        targetType: "media_id",
        targetId: remap.oldMediaId,
        result: "ok",
        meta: {
          runId,
          oldMediaId: remap.oldMediaId,
          newMediaId: remap.newMediaId,
          galleryRowsUpdated: remap.galleryRowsUpdated,
          viewRowsUpdated: remap.viewRowsUpdated,
          reason: remap.reason,
          confidence: remap.confidence,
        },
        requestIp: input.requestIp ?? null,
      });
    }

    this.store.upsertUnresolved(runId, unresolved, nowIso);
    this.store.resolveMissingUnresolved(currentIds, runId, nowIso);

    this.store.insertAuditEvent({
      action: "reconciliation.run",
      targetType: "reconciliation_run",
      targetId: runId,
      result: "ok",
      meta: {
        status,
        previousMediaCount: input.previousMediaById.size,
        currentMediaCount: input.currentMediaById.size,
        remapCount: remaps.length,
        unresolvedCount: unresolved.length,
      },
      requestIp: input.requestIp ?? null,
    });

    const summary = this.store.getRunById(runId)!;
    return {
      summary,
      remaps,
    };
  }
}

