import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

export interface AuditEventRecord {
  id: string;
  actorUserId: string | null;
  actorType: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  result: string;
  metaJson: string | null;
  createdAt: string;
  requestIp: string | null;
}

export class AuditStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public insertEvent(input: {
    actorUserId?: string | null;
    actorType: "user" | "system" | "anonymous";
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    result: "ok" | "error";
    meta?: Record<string, unknown>;
    requestIp?: string | null;
    createdAt?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO audit_events(
          id, actor_user_id, actor_type, action, target_type, target_id,
          result, meta_json, created_at, request_ip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.actorUserId ?? null,
        input.actorType,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        input.result,
        input.meta ? JSON.stringify(input.meta) : null,
        input.createdAt ?? new Date().toISOString(),
        input.requestIp ?? null,
      );
  }

  public listRecent(limit: number): AuditEventRecord[] {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const rows = this.db
      .prepare(
        `SELECT id, actor_user_id, actor_type, action, target_type, target_id, result, meta_json, created_at, request_ip
         FROM audit_events
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(safeLimit) as Array<{
      id: string;
      actor_user_id: string | null;
      actor_type: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      result: string;
      meta_json: string | null;
      created_at: string;
      request_ip: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actor_user_id,
      actorType: row.actor_type,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      result: row.result,
      metaJson: row.meta_json,
      createdAt: row.created_at,
      requestIp: row.request_ip,
    }));
  }

  public countByActionSince(action: string, sinceIso: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM audit_events WHERE action = ? AND created_at >= ?")
      .get(action, sinceIso) as { count: number };

    return Number(row.count);
  }

  public deleteOlderThan(cutoffIso: string): number {
    const result = this.db
      .prepare("DELETE FROM audit_events WHERE created_at < ?")
      .run(cutoffIso);

    return result.changes;
  }
}
