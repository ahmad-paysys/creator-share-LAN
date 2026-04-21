import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { SafeUser, UserRole } from "./auth/types";
import type {
  GalleryAccessSnapshot,
  GalleryItemRecord,
  GalleryListItem,
  GalleryRecord,
  GalleryVisibility,
} from "./gallery-types";

function mapGallery(row: {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: GalleryVisibility;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: number;
}): GalleryRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted === 1,
  };
}

function mapGalleryItem(row: {
  id: string;
  gallery_id: string;
  media_id: string;
  order_index: number;
  added_by: string | null;
  added_at: string;
}): GalleryItemRecord {
  return {
    id: row.id,
    galleryId: row.gallery_id,
    mediaId: row.media_id,
    orderIndex: row.order_index,
    addedBy: row.added_by,
    addedAt: row.added_at,
  };
}

export class GalleryStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public createGallery(input: {
    slug: string;
    title: string;
    description: string | null;
    visibility: GalleryVisibility;
    createdBy: string;
  }): GalleryRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO galleries(id, slug, title, description, visibility, created_by, created_at, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(id, input.slug, input.title, input.description, input.visibility, input.createdBy, now, now);

    return this.getGalleryBySlug(input.slug)!;
  }

  public getGalleryBySlug(slug: string): GalleryRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, slug, title, description, visibility, created_by, created_at, updated_at, is_deleted
         FROM galleries WHERE slug = ?`,
      )
      .get(slug) as
      | {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          visibility: GalleryVisibility;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          is_deleted: number;
        }
      | undefined;

    return row ? mapGallery(row) : null;
  }

  public updateGalleryBySlug(slug: string, input: {
    title?: string;
    description?: string | null;
    visibility?: GalleryVisibility;
  }): GalleryRecord | null {
    const existing = this.getGalleryBySlug(slug);
    if (!existing || existing.isDeleted) {
      return null;
    }

    const title = input.title ?? existing.title;
    const description = input.description !== undefined ? input.description : existing.description;
    const visibility = input.visibility ?? existing.visibility;

    this.db.prepare(
      `UPDATE galleries
       SET title = ?, description = ?, visibility = ?, updated_at = ?
       WHERE slug = ?`,
    ).run(title, description, visibility, new Date().toISOString(), slug);

    return this.getGalleryBySlug(slug);
  }

  public softDeleteGalleryBySlug(slug: string): boolean {
    const result = this.db
      .prepare(`UPDATE galleries SET is_deleted = 1, updated_at = ? WHERE slug = ? AND is_deleted = 0`)
      .run(new Date().toISOString(), slug);

    return result.changes > 0;
  }

  public listPublicGalleries(): GalleryListItem[] {
    const rows = this.db
      .prepare(
        `SELECT g.slug, g.title, g.description, g.visibility, g.updated_at,
                COUNT(gi.id) as item_count
         FROM galleries g
         LEFT JOIN gallery_items gi ON gi.gallery_id = g.id
         WHERE g.is_deleted = 0 AND g.visibility = 'public'
         GROUP BY g.id
         ORDER BY g.updated_at DESC`,
      )
      .all() as Array<{
      slug: string;
      title: string;
      description: string | null;
      visibility: GalleryVisibility;
      updated_at: string;
      item_count: number;
    }>;

    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      updatedAt: row.updated_at,
      itemCount: Number(row.item_count),
    }));
  }

  public listAccessibleGalleries(user: SafeUser): GalleryListItem[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT g.slug, g.title, g.description, g.visibility, g.updated_at,
                (SELECT COUNT(1) FROM gallery_items gi WHERE gi.gallery_id = g.id) as item_count
         FROM galleries g
         LEFT JOIN gallery_access ga_role
           ON ga_role.gallery_id = g.id
          AND ga_role.subject_type = 'role'
          AND ga_role.subject_value = ?
          AND ga_role.permission = 'view'
         LEFT JOIN gallery_access ga_user
           ON ga_user.gallery_id = g.id
          AND ga_user.subject_type = 'user'
          AND ga_user.subject_value = ?
          AND ga_user.permission = 'view'
         WHERE g.is_deleted = 0
           AND (
             g.visibility = 'public'
             OR g.created_by = ?
             OR ga_role.id IS NOT NULL
             OR ga_user.id IS NOT NULL
             OR ? IN ('owner', 'admin')
           )
         ORDER BY g.updated_at DESC`,
      )
      .all(user.role, user.id, user.id, user.role) as Array<{
      slug: string;
      title: string;
      description: string | null;
      visibility: GalleryVisibility;
      updated_at: string;
      item_count: number;
    }>;

    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      updatedAt: row.updated_at,
      itemCount: Number(row.item_count),
    }));
  }

  public setGalleryAccess(galleryId: string, input: {
    roleShares: UserRole[];
    userShares: string[];
    createdBy: string;
  }): GalleryAccessSnapshot {
    const tx = this.db.transaction(() => {
      this.db.prepare("DELETE FROM gallery_access WHERE gallery_id = ?").run(galleryId);
      const insert = this.db.prepare(
        `INSERT INTO gallery_access(id, gallery_id, subject_type, subject_value, permission, created_by, created_at)
         VALUES (?, ?, ?, ?, 'view', ?, ?)`,
      );

      const now = new Date().toISOString();
      const roleSet = Array.from(new Set(input.roleShares));
      const userSet = Array.from(new Set(input.userShares));

      for (const role of roleSet) {
        insert.run(randomUUID(), galleryId, "role", role, input.createdBy, now);
      }

      for (const userId of userSet) {
        insert.run(randomUUID(), galleryId, "user", userId, input.createdBy, now);
      }
    });

    tx();
    return this.getGalleryAccess(galleryId);
  }

  public getGalleryAccess(galleryId: string): GalleryAccessSnapshot {
    const rows = this.db
      .prepare(
        `SELECT subject_type, subject_value
         FROM gallery_access
         WHERE gallery_id = ? AND permission = 'view'`,
      )
      .all(galleryId) as Array<{ subject_type: "role" | "user"; subject_value: string }>;

    return {
      roleShares: rows.filter((row) => row.subject_type === "role").map((row) => row.subject_value as UserRole),
      userShares: rows.filter((row) => row.subject_type === "user").map((row) => row.subject_value),
    };
  }

  public addGalleryItems(input: {
    galleryId: string;
    mediaIds: string[];
    addedBy: string;
  }): void {
    const mediaIds = Array.from(new Set(input.mediaIds));
    if (mediaIds.length === 0) {
      return;
    }

    const tx = this.db.transaction(() => {
      const maxRow = this.db
        .prepare("SELECT COALESCE(MAX(order_index), -1) as max_order FROM gallery_items WHERE gallery_id = ?")
        .get(input.galleryId) as { max_order: number };

      let orderIndex = Number(maxRow.max_order) + 1;
      const now = new Date().toISOString();
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO gallery_items(id, gallery_id, media_id, order_index, added_by, added_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );

      for (const mediaId of mediaIds) {
        insert.run(randomUUID(), input.galleryId, mediaId, orderIndex, input.addedBy, now);
        orderIndex += 1;
      }
    });

    tx();
  }

  public removeGalleryItem(galleryId: string, mediaId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM gallery_items WHERE gallery_id = ? AND media_id = ?")
      .run(galleryId, mediaId);

    return result.changes > 0;
  }

  public getGalleryItems(galleryId: string): GalleryItemRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, gallery_id, media_id, order_index, added_by, added_at
         FROM gallery_items WHERE gallery_id = ?
         ORDER BY order_index ASC`,
      )
      .all(galleryId) as Array<{
      id: string;
      gallery_id: string;
      media_id: string;
      order_index: number;
      added_by: string | null;
      added_at: string;
    }>;

    return rows.map(mapGalleryItem);
  }

  public canUserReadGallery(gallery: GalleryRecord, user: SafeUser): boolean {
    if (gallery.visibility === "public") {
      return true;
    }

    if (user.role === "owner" || user.role === "admin") {
      return true;
    }

    if (gallery.createdBy === user.id) {
      return true;
    }

    const row = this.db
      .prepare(
        `SELECT id FROM gallery_access
         WHERE gallery_id = ?
           AND permission = 'view'
           AND (
             (subject_type = 'role' AND subject_value = ?)
             OR (subject_type = 'user' AND subject_value = ?)
           )
         LIMIT 1`,
      )
      .get(gallery.id, user.role, user.id) as { id: string } | undefined;

    return Boolean(row);
  }
}


