import type { Express, Request, Response } from "express";
import { AuthStore } from "./auth/store";
import { GalleryStore } from "./gallery-store";
import { isLanIp } from "./access/lan";
import { TemporaryViewStore } from "./temporary-view-store";
import { canManageTemporaryView } from "./temporary-view-types";
import type { TemporaryViewVisibility } from "./temporary-view-types";
import type { MediaItem } from "./types/app";

interface TemporaryViewRouteDeps {
  temporaryViewStore: TemporaryViewStore;
  galleryStore: GalleryStore;
  authStore: AuthStore;
  ensureMediaFresh: () => Promise<void>;
  getMediaById: (id: string) => MediaItem | undefined;
  defaultExpiryHours: number;
}

function requireCurator(req: Request, res: Response) {
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

function parseVisibility(value: unknown): TemporaryViewVisibility | null {
  if (value === "public" || value === "private") {
    return value;
  }

  return null;
}

function parseExpiry(
  input: { expiresAt?: unknown; expiresInHours?: unknown },
  defaultExpiryHours: number,
): string | null {
  if (typeof input.expiresAt === "string") {
    const value = Date.parse(input.expiresAt);
    if (!Number.isFinite(value) || value <= Date.now()) {
      return null;
    }

    return new Date(value).toISOString();
  }

  if (typeof input.expiresInHours === "number" && Number.isFinite(input.expiresInHours)) {
    const boundedHours = Math.min(Math.max(input.expiresInHours, 1), 24 * 30);
    return new Date(Date.now() + boundedHours * 60 * 60 * 1000).toISOString();
  }

  const boundedDefault = Math.min(Math.max(defaultExpiryHours, 1), 24 * 30);
  return new Date(Date.now() + boundedDefault * 60 * 60 * 1000).toISOString();
}

async function serializeView(
  deps: TemporaryViewRouteDeps,
  view: ReturnType<TemporaryViewStore["getBySlug"]> extends infer T
    ? T extends null
      ? never
      : Exclude<T, null>
    : never,
) {
  await deps.ensureMediaFresh();
  const itemRefs = deps.temporaryViewStore.getItems(view.id);
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
    slug: view.slug,
    title: view.title,
    visibility: view.visibility,
    sourceType: view.sourceType,
    sourceGalleryId: view.sourceGalleryId,
    expiresAt: view.expiresAt,
    maxUses: view.maxUses,
    usesCount: view.usesCount,
    revokedAt: view.revokedAt,
    items,
    missingMediaIds,
    updatedAt: view.updatedAt,
  };
}

export function registerTemporaryViewRoutes(app: Express, deps: TemporaryViewRouteDeps): void {
  app.post("/api/views", async (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = typeof req.body?.slug === "string" ? req.body.slug.trim().toLowerCase() : "";
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const visibility = parseVisibility(req.body?.visibility);
    const expiresAt = parseExpiry({
      expiresAt: req.body?.expiresAt,
      expiresInHours: req.body?.expiresInHours,
    }, deps.defaultExpiryHours);

    const maxUses =
      typeof req.body?.maxUses === "number" && Number.isFinite(req.body.maxUses)
        ? Math.max(1, Math.floor(req.body.maxUses))
        : null;

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
    if (!expiresAt) {
      res.status(400).json({ error: "Invalid expiry" });
      return;
    }

    const mediaIds = Array.isArray(req.body?.mediaIds)
      ? req.body.mediaIds.filter((entry: unknown): entry is string => typeof entry === "string")
      : [];

    const gallerySlug = typeof req.body?.gallerySlug === "string" ? req.body.gallerySlug.trim() : "";

    if (mediaIds.length === 0 && !gallerySlug) {
      res.status(400).json({ error: "Either mediaIds or gallerySlug is required" });
      return;
    }

    await deps.ensureMediaFresh();

    let finalMediaIds = mediaIds;
    let sourceType: "selection" | "gallery" = "selection";
    let sourceGalleryId: string | null = null;

    if (gallerySlug) {
      const gallery = deps.galleryStore.getGalleryBySlug(gallerySlug);
      if (!gallery || gallery.isDeleted) {
        res.status(404).json({ error: "Gallery not found" });
        return;
      }

      if (!deps.galleryStore.canUserReadGallery(gallery, user)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      sourceType = "gallery";
      sourceGalleryId = gallery.id;
      finalMediaIds = deps.galleryStore.getGalleryItems(gallery.id).map((entry) => entry.mediaId);
    }

    const unknownMediaIds = finalMediaIds.filter((id: string) => !deps.getMediaById(id));
    if (unknownMediaIds.length > 0) {
      res.status(400).json({ error: "Unknown media ids", unknownMediaIds });
      return;
    }

    try {
      const view = deps.temporaryViewStore.createView({
        slug,
        title,
        visibility,
        sourceType,
        sourceGalleryId,
        createdBy: user.id,
        expiresAt,
        maxUses,
        mediaIds: finalMediaIds,
      });

      res.status(201).json({ view: await serializeView(deps, view) });
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: share_views\.slug/.test(error.message)) {
        res.status(409).json({ error: "Slug already exists" });
        return;
      }

      res.status(400).json({ error: "Could not create view" });
    }
  });

  app.get("/api/view/:slug", async (req, res) => {
    const slug = String(req.params.slug);
    const consume = deps.temporaryViewStore.consume(slug);
    if (!consume.ok) {
      const status = consume.reason === "not_found" ? 404 : 410;
      res.status(status).json({ error: consume.reason });
      return;
    }

    const view = consume.view;
    const user = req.auth?.user ?? null;

    if (view.visibility === "public") {
      if (!user && !isLanIp(req.ip)) {
        res.status(403).json({ error: "Public view access is LAN-only" });
        return;
      }
    } else {
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!deps.temporaryViewStore.canReadPrivateView(view, user)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    res.json({ view: await serializeView(deps, view) });
  });

  app.patch("/api/view/:slug", async (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = String(req.params.slug);
    const existing = deps.temporaryViewStore.getBySlug(slug);
    if (!existing) {
      res.status(404).json({ error: "View not found" });
      return;
    }

    if (!canManageTemporaryView(user, existing)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const updates: {
      title?: string;
      visibility?: TemporaryViewVisibility;
      expiresAt?: string;
      maxUses?: number | null;
    } = {};

    if (typeof req.body?.title === "string") {
      const title = req.body.title.trim();
      if (!title) {
        res.status(400).json({ error: "title cannot be empty" });
        return;
      }
      updates.title = title;
    }

    if (req.body?.visibility !== undefined) {
      const visibility = parseVisibility(req.body.visibility);
      if (!visibility) {
        res.status(400).json({ error: "visibility must be public or private" });
        return;
      }
      updates.visibility = visibility;
    }

    if (req.body?.expiresAt !== undefined || req.body?.expiresInHours !== undefined) {
      const expiresAt = parseExpiry({
        expiresAt: req.body?.expiresAt,
        expiresInHours: req.body?.expiresInHours,
      }, deps.defaultExpiryHours);
      if (!expiresAt) {
        res.status(400).json({ error: "Invalid expiry" });
        return;
      }
      updates.expiresAt = expiresAt;
    }

    if (req.body?.maxUses !== undefined) {
      if (req.body.maxUses === null) {
        updates.maxUses = null;
      } else if (typeof req.body.maxUses === "number" && Number.isFinite(req.body.maxUses)) {
        updates.maxUses = Math.max(1, Math.floor(req.body.maxUses));
      } else {
        res.status(400).json({ error: "maxUses must be a number or null" });
        return;
      }
    }

    const updated = deps.temporaryViewStore.updateView(slug, updates);
    if (!updated) {
      res.status(404).json({ error: "View not found" });
      return;
    }

    res.json({ view: await serializeView(deps, updated) });
  });

  app.post("/api/view/:slug/revoke", (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = String(req.params.slug);
    const existing = deps.temporaryViewStore.getBySlug(slug);
    if (!existing) {
      res.status(404).json({ error: "View not found" });
      return;
    }

    if (!canManageTemporaryView(user, existing)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const revoked = deps.temporaryViewStore.revoke(slug);
    res.json({ view: revoked });
  });

  app.delete("/api/view/:slug", (req, res) => {
    const user = requireCurator(req, res);
    if (!user) {
      return;
    }

    const slug = String(req.params.slug);
    const existing = deps.temporaryViewStore.getBySlug(slug);
    if (!existing) {
      res.status(404).json({ error: "View not found" });
      return;
    }

    if (!canManageTemporaryView(user, existing)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    deps.temporaryViewStore.deleteBySlug(slug);
    res.json({ ok: true });
  });
}


