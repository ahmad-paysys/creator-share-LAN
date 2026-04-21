import type { Express, Request, Response } from "express";
import type { SafeUser, UserRole } from "./auth/types";
import { AuthStore } from "./auth/store";
import { GalleryStore } from "./gallery-store";
import type { GalleryRecord, GalleryVisibility } from "./gallery-types";
import { canManageGallery } from "./gallery-types";
import { isLanIp } from "./access/lan";
import type { MediaItem } from "./types/app";

interface GalleryRouteDeps {
  galleryStore: GalleryStore;
  authStore: AuthStore;
  ensureMediaFresh: () => Promise<void>;
  getMediaById: (id: string) => MediaItem | undefined;
}

function requireCurator(req: Request, res: Response): SafeUser | null {
  const user = req.auth?.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  if (user.role === "owner" || user.role === "admin" || user.role === "editor") {
    return user;
  }

  res.status(403).json({ error: "Forbidden" });
  return null;
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{2,63}$/.test(slug);
}

function sanitizeVisibility(value: unknown): GalleryVisibility | null {
  if (value === "public" || value === "private") {
    return value;
  }
  return null;
}

function enforceReadAccess(
  galleryStore: GalleryStore,
  gallery: GalleryRecord,
  user: SafeUser | null,
  ip: string,
): { allowed: boolean; status: number } {
  if (!user && gallery.visibility === "private") {
    return { allowed: false, status: 401 };
  }

  if (!user && gallery.visibility === "public" && !isLanIp(ip)) {
    return { allowed: false, status: 403 };
  }

  if (user && !galleryStore.canUserReadGallery(gallery, user)) {
    return { allowed: false, status: 403 };
  }

  return { allowed: true, status: 200 };
}

async function serializeGallery(
  deps: GalleryRouteDeps,
  gallery: GalleryRecord,
): Promise<{
  slug: string;
  title: string;
  description: string | null;
  visibility: GalleryVisibility;
  access: { roleShares: UserRole[]; userShares: string[] };
  items: MediaItem[];
  missingMediaIds: string[];
  updatedAt: string;
}> {
  await deps.ensureMediaFresh();
  const itemRefs = deps.galleryStore.getGalleryItems(gallery.id);
  const items: MediaItem[] = [];
  const missingMediaIds: string[] = [];

  for (const ref of itemRefs) {
    const media = deps.getMediaById(ref.mediaId);
    if (media) {
      items.push(media);
    } else {
      missingMediaIds.push(ref.mediaId);
    }
  }

  return {
    slug: gallery.slug,
    title: gallery.title,
    description: gallery.description,
    visibility: gallery.visibility,
    access: deps.galleryStore.getGalleryAccess(gallery.id),
    items,
    missingMediaIds,
    updatedAt: gallery.updatedAt,
  };
}

export function registerGalleryRoutes(app: Express, deps: GalleryRouteDeps): void {
  app.get("/api/galleries", (req, res) => {
    const user = req.auth?.user ?? null;

    if (!user && !isLanIp(req.ip)) {
      res.status(403).json({ error: "Public gallery access is LAN-only" });
      return;
    }

    const galleries = user
      ? deps.galleryStore.listAccessibleGalleries(user)
      : deps.galleryStore.listPublicGalleries();

    res.json({ galleries });
  });

  app.post("/api/galleries", async (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = typeof req.body?.slug === "string" ? req.body.slug.trim().toLowerCase() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : null;
    const visibility = sanitizeVisibility(req.body?.visibility);

    if (!slug || !isValidSlug(slug)) {
      res.status(400).json({ error: "Invalid slug" });
      return;
    }
    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (!visibility) {
      res.status(400).json({ error: "visibility must be public or private" });
      return;
    }

    try {
      const gallery = deps.galleryStore.createGallery({
        slug,
        title,
        description,
        visibility,
        createdBy: user.id,
      });

      res.status(201).json({ gallery: await serializeGallery(deps, gallery) });
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: galleries\.slug/.test(error.message)) {
        res.status(409).json({ error: "Slug already exists" });
        return;
      }

      res.status(400).json({ error: "Could not create gallery" });
    }
  });

  app.get("/api/gallery/:slug", async (req, res) => {
    const slug = String(req.params.slug);
    const gallery = deps.galleryStore.getGalleryBySlug(slug);
    if (!gallery || gallery.isDeleted) {
      res.status(404).json({ error: "Gallery not found" });
      return;
    }

    const decision = enforceReadAccess(deps.galleryStore, gallery, req.auth?.user ?? null, req.ip ?? "");
    if (!decision.allowed) {
      res.status(decision.status).json({ error: "Forbidden" });
      return;
    }

    res.json({ gallery: await serializeGallery(deps, gallery) });
  });

  app.patch("/api/gallery/:slug", async (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = String(req.params.slug);
    const existing = deps.galleryStore.getGalleryBySlug(slug);
    if (!existing || existing.isDeleted) {
      res.status(404).json({ error: "Gallery not found" });
      return;
    }

    if (!canManageGallery(user, existing)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const update: {
      title?: string;
      description?: string | null;
      visibility?: GalleryVisibility;
    } = {};

    if (typeof req.body?.title === "string") {
      const title = req.body.title.trim();
      if (!title) {
        res.status(400).json({ error: "title cannot be empty" });
        return;
      }
      update.title = title;
    }

    if (typeof req.body?.description === "string") {
      update.description = req.body.description.trim() || null;
    }

    if (req.body?.visibility !== undefined) {
      const visibility = sanitizeVisibility(req.body.visibility);
      if (!visibility) {
        res.status(400).json({ error: "visibility must be public or private" });
        return;
      }
      update.visibility = visibility;
    }

    const gallery = deps.galleryStore.updateGalleryBySlug(slug, update);
    if (!gallery) {
      res.status(404).json({ error: "Gallery not found" });
      return;
    }

    res.json({ gallery: await serializeGallery(deps, gallery) });
  });

  app.delete("/api/gallery/:slug", (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = String(req.params.slug);
    const existing = deps.galleryStore.getGalleryBySlug(slug);
    if (!existing || existing.isDeleted) {
      res.status(404).json({ error: "Gallery not found" });
      return;
    }

    if (!canManageGallery(user, existing)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    deps.galleryStore.softDeleteGalleryBySlug(slug);
    res.json({ ok: true });
  });

  app.post("/api/gallery/:slug/items", async (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = String(req.params.slug);
    const gallery = deps.galleryStore.getGalleryBySlug(slug);
    if (!gallery || gallery.isDeleted) {
      res.status(404).json({ error: "Gallery not found" });
      return;
    }

    if (!canManageGallery(user, gallery)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const mediaIds = Array.isArray(req.body?.mediaIds)
      ? req.body.mediaIds.filter((entry: unknown): entry is string => typeof entry === "string")
      : [];

    if (mediaIds.length === 0) {
      res.status(400).json({ error: "mediaIds is required" });
      return;
    }

    await deps.ensureMediaFresh();
    const unknownMediaIds = mediaIds.filter((id: string) => !deps.getMediaById(id));
    if (unknownMediaIds.length > 0) {
      res.status(400).json({ error: "Unknown media ids", unknownMediaIds });
      return;
    }

    deps.galleryStore.addGalleryItems({
      galleryId: gallery.id,
      mediaIds,
      addedBy: user.id,
    });

    const refreshed = deps.galleryStore.getGalleryBySlug(slug)!;
    res.json({ gallery: await serializeGallery(deps, refreshed) });
  });

  app.delete("/api/gallery/:slug/items/:mediaId", async (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = String(req.params.slug);
    const mediaId = String(req.params.mediaId);
    const gallery = deps.galleryStore.getGalleryBySlug(slug);
    if (!gallery || gallery.isDeleted) {
      res.status(404).json({ error: "Gallery not found" });
      return;
    }

    if (!canManageGallery(user, gallery)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const removed = deps.galleryStore.removeGalleryItem(gallery.id, mediaId);
    if (!removed) {
      res.status(404).json({ error: "Gallery item not found" });
      return;
    }

    const refreshed = deps.galleryStore.getGalleryBySlug(slug)!;
    res.json({ gallery: await serializeGallery(deps, refreshed) });
  });

  app.patch("/api/gallery/:slug/access", async (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = String(req.params.slug);
    const gallery = deps.galleryStore.getGalleryBySlug(slug);
    if (!gallery || gallery.isDeleted) {
      res.status(404).json({ error: "Gallery not found" });
      return;
    }

    if (!canManageGallery(user, gallery)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const roleShares = Array.isArray(req.body?.roleShares)
      ? req.body.roleShares.filter((entry: unknown): entry is UserRole =>
          entry === "owner" || entry === "admin" || entry === "editor" || entry === "viewer",
        )
      : [];

    const usernames = Array.isArray(req.body?.userShares)
      ? req.body.userShares.filter((entry: unknown): entry is string => typeof entry === "string")
      : [];

    const resolvedUsers = deps.authStore.getUsersByUsernames(usernames);
    const resolvedUserIds = resolvedUsers.map((entry) => entry.id);
    const resolvedUsernames = new Set(resolvedUsers.map((entry) => entry.username));
    const unknownUsernames = usernames.filter((entry: string) => !resolvedUsernames.has(entry));
    if (unknownUsernames.length > 0) {
      res.status(400).json({ error: "Unknown users", unknownUsernames });
      return;
    }

    const access = deps.galleryStore.setGalleryAccess(gallery.id, {
      roleShares,
      userShares: resolvedUserIds,
      createdBy: user.id,
    });

    res.json({
      access: {
        roleShares: access.roleShares,
        userShares: resolvedUsers.map((entry) => entry.username),
      },
    });
  });
}


