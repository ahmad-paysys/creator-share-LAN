import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { SafeUser } from "./auth/types";
import type {
  TemporaryViewItemRecord,
  TemporaryViewRecord,
  TemporaryViewSourceType,
  TemporaryViewVisibility,
} from "./temporary-view-types";

function mapView(row: {
  id: string;
  slug: string;
  title: string;
  visibility: TemporaryViewVisibility;
  source_type: TemporaryViewSourceType;
  source_gallery_id: string | null;
  created_by: string | null;
  expires_at: string;
  max_uses: number | null;
  uses_count: number;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}): TemporaryViewRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    visibility: row.visibility,
    sourceType: row.source_type,
    sourceGalleryId: row.source_gallery_id,
    createdBy: row.created_by,
    expiresAt: row.expires_at,
    maxUses: row.max_uses,
    usesCount: row.uses_count,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapViewItem(row: {
  id: string;
  share_view_id: string;
  media_id: string;
  order_index: number;
  created_at: string;
}): TemporaryViewItemRecord {
  return {
    id: row.id,
    shareViewId: row.share_view_id,
    mediaId: row.media_id,
    orderIndex: row.order_index,
    createdAt: row.created_at,
  };
}

export class TemporaryViewStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public createView(input: {
    slug: string;
    title: string;
    visibility: TemporaryViewVisibility;
    sourceType: TemporaryViewSourceType;
    sourceGalleryId: string | null;
    createdBy: string;
    expiresAt: string;
    maxUses: number | null;
    mediaIds: string[];
  }): TemporaryViewRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO share_views(
          id, slug, title, visibility, source_type, source_gallery_id,
          created_by, expires_at, max_uses, uses_count, revoked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
      ).run(
        id,
        input.slug,
        input.title,
        input.visibility,
        input.sourceType,
        input.sourceGalleryId,
        input.createdBy,
        input.expiresAt,
        input.maxUses,
        now,
        now,
      );

      const insertItem = this.db.prepare(
        `INSERT OR IGNORE INTO share_view_items(id, share_view_id, media_id, order_index, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      );

      let orderIndex = 0;
      for (const mediaId of Array.from(new Set(input.mediaIds))) {
        insertItem.run(randomUUID(), id, mediaId, orderIndex, now);
        orderIndex += 1;
      }
    });

    tx();
    return this.getBySlug(input.slug)!;
  }

  public getBySlug(slug: string): TemporaryViewRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, slug, title, visibility, source_type, source_gallery_id, created_by,
                expires_at, max_uses, uses_count, revoked_at, created_at, updated_at
         FROM share_views
         WHERE slug = ?`,
      )
      .get(slug) as
      | {
          id: string;
          slug: string;
          title: string;
          visibility: TemporaryViewVisibility;
          source_type: TemporaryViewSourceType;
          source_gallery_id: string | null;
          created_by: string | null;
          expires_at: string;
          max_uses: number | null;
          uses_count: number;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return row ? mapView(row) : null;
  }

  public getItems(viewId: string): TemporaryViewItemRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, share_view_id, media_id, order_index, created_at
         FROM share_view_items
         WHERE share_view_id = ?
         ORDER BY order_index ASC`,
      )
      .all(viewId) as Array<{
      id: string;
      share_view_id: string;
      media_id: string;
      order_index: number;
      created_at: string;
    }>;

    return rows.map(mapViewItem);
  }

  public updateView(slug: string, input: {
    title?: string;
    visibility?: TemporaryViewVisibility;
    expiresAt?: string;
    maxUses?: number | null;
  }): TemporaryViewRecord | null {
    const existing = this.getBySlug(slug);
    if (!existing) {
      return null;
    }

    const title = input.title ?? existing.title;
    const visibility = input.visibility ?? existing.visibility;
    const expiresAt = input.expiresAt ?? existing.expiresAt;
    const maxUses = input.maxUses !== undefined ? input.maxUses : existing.maxUses;

    this.db.prepare(
      `UPDATE share_views
       SET title = ?, visibility = ?, expires_at = ?, max_uses = ?, updated_at = ?
       WHERE slug = ?`,
    ).run(title, visibility, expiresAt, maxUses, new Date().toISOString(), slug);

    return this.getBySlug(slug);
  }

  public revoke(slug: string): TemporaryViewRecord | null {
    this.db
      .prepare("UPDATE share_views SET revoked_at = ?, updated_at = ? WHERE slug = ?")
      .run(new Date().toISOString(), new Date().toISOString(), slug);

    return this.getBySlug(slug);
  }

  public deleteBySlug(slug: string): boolean {
    const result = this.db.prepare("DELETE FROM share_views WHERE slug = ?").run(slug);
    return result.changes > 0;
  }

  public consume(slug: string): { ok: true; view: TemporaryViewRecord } | { ok: false; reason: string } {
    const view = this.getBySlug(slug);
    if (!view) {
      return { ok: false, reason: "not_found" };
    }

    if (view.revokedAt) {
      return { ok: false, reason: "revoked" };
    }

    const now = Date.now();
    if (Date.parse(view.expiresAt) <= now) {
      return { ok: false, reason: "expired" };
    }

    if (typeof view.maxUses === "number" && view.usesCount >= view.maxUses) {
      return { ok: false, reason: "exhausted" };
    }

    this.db
      .prepare("UPDATE share_views SET uses_count = uses_count + 1, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), view.id);

    return { ok: true, view: this.getBySlug(slug)! };
  }

  public canReadPrivateView(view: TemporaryViewRecord, user: SafeUser): boolean {
    if (user.role === "owner" || user.role === "admin") {
      return true;
    }

    return view.createdBy === user.id;
  }

  public countExpiringBetween(nowIso: string, cutoffIso: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM share_views
         WHERE revoked_at IS NULL
           AND expires_at > ?
           AND expires_at <= ?`,
      )
      .get(nowIso, cutoffIso) as { count: number };

    return Number(row.count);
  }
}


