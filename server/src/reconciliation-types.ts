export interface BrokenMediaReference {
  mediaId: string;
  galleryRefCount: number;
  viewRefCount: number;
}

export interface ReconciliationRemapRecord {
  oldMediaId: string;
  newMediaId: string;
  reason: string;
  confidence: number;
  galleryRowsUpdated: number;
  viewRowsUpdated: number;
}

export interface ReconciliationRunSummary {
  runId: string;
  status: "success" | "partial" | "failed";
  triggerReason: string;
  previousMediaCount: number;
  currentMediaCount: number;
  remapCount: number;
  unresolvedCount: number;
  startedAt: string;
  completedAt: string;
}

export interface ReconciliationRecentRun extends ReconciliationRunSummary {
  summaryJson: string | null;
}

export interface ReconciliationUnresolvedRecord extends BrokenMediaReference {
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  lastRunId: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

