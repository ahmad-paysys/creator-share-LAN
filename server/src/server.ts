import fs from "node:fs";
import path from "node:path";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import mime from "mime-types";
import { requireReadAccess } from "./access-middleware";
import { AuthService } from "./auth-service";
import { authContextMiddleware } from "./auth-middleware";
import { registerAuthRoutes } from "./auth-routes";
import { AuthStore } from "./auth-store";
import { loadConfig } from "./config";
import { AppDatabase } from "./database";
import { MediaIndex } from "./media-index";
import { createTokenBucketRateLimiter } from "./rate-limit";
import { ResizeService } from "./resize";
import { registerSettingsRoutes } from "./settings-routes";
import { SettingsStore } from "./settings-store";
import { ThumbnailService } from "./thumbnail-service";

const config = loadConfig();
const app = express();

const appDb = new AppDatabase(config.databasePath);
const authStore = new AuthStore(appDb.connection);
const authService = new AuthService(authStore, config.authSessionTtlHours);
const settingsStore = new SettingsStore(appDb.connection);

const mediaIndex = new MediaIndex(config);
const thumbnailService = new ThumbnailService(config);
const resizeService = new ResizeService(config, thumbnailService);

const corsOrigin =
  config.corsAllowedOrigins.includes("*") || config.exposeToLan
    ? "*"
    : config.corsAllowedOrigins;

app.use(cors({ origin: corsOrigin }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(authContextMiddleware(authService, config.authCookieName));

registerAuthRoutes(app, {
  authService,
  cookieName: config.authCookieName,
});
registerSettingsRoutes(app, settingsStore);

const limiter = createTokenBucketRateLimiter(100, 100);
let queuedRevision = -1;
let knownMediaIds = new Set<string>();

const syncStatus = {
  state: "idle" as "idle" | "scanning" | "updated",
  revision: 0,
  mediaCount: 0,
  newMediaCount: 0,
  lastScanAt: Date.now(),
  queued: 0,
  active: 0,
  pendingThumbnails: 0,
  indexDirty: false,
};

async function refreshIndexAndQueue(): Promise<void> {
  syncStatus.indexDirty = mediaIndex.isDirty();
  const changed = await mediaIndex.ensureFresh();
  syncStatus.indexDirty = mediaIndex.isDirty();
  const revision = mediaIndex.getRevision();

  if (!changed && revision === queuedRevision) {
    const queueStats = thumbnailService.getQueueStats();
    syncStatus.queued = queueStats.queued;
    syncStatus.active = queueStats.active;
    syncStatus.pendingThumbnails = queueStats.queued + queueStats.active;
    return;
  }

  syncStatus.state = "scanning";
  const mediaItems = Array.from(mediaIndex.mediaById.values());

  let newMediaCount = 0;
  for (const media of mediaItems) {
    if (!knownMediaIds.has(media.id)) {
      newMediaCount += 1;
    }
  }
  if (queuedRevision < 0) {
    newMediaCount = 0;
  }

  const result = await thumbnailService.syncMediaCatalog(mediaItems);
  knownMediaIds = new Set(mediaItems.map((media) => media.id));

  queuedRevision = revision;
  const queueStats = thumbnailService.getQueueStats();
  syncStatus.state = newMediaCount > 0 ? "updated" : "idle";
  syncStatus.revision = revision;
  syncStatus.mediaCount = mediaItems.length;
  syncStatus.newMediaCount = newMediaCount;
  syncStatus.lastScanAt = mediaIndex.getLastRebuiltAt();
  syncStatus.queued = queueStats.queued;
  syncStatus.active = queueStats.active;
  syncStatus.pendingThumbnails = queueStats.queued + queueStats.active;

  if (result.total === 0) {
    syncStatus.state = "idle";
  }
}

app.get("/health", async (_req, res) => {
  await refreshIndexAndQueue();
  res.json({
    version: "1.0.0",
    mediaCount: mediaIndex.mediaById.size,
    thumbnailsReady: fs.existsSync(config.thumbsDir),
  });
});

app.get("/api/folders", requireReadAccess(settingsStore, "folder_library"), async (_req, res) => {
  await refreshIndexAndQueue();
  res.json(mediaIndex.folderTree);
});

app.get("/api/sync-status", requireReadAccess(settingsStore, "sync_status"), async (_req, res) => {
  await refreshIndexAndQueue();
  res.json(syncStatus);
});

app.get("/api/folders/:folderId/media", requireReadAccess(settingsStore, "folder_library"), async (req, res) => {
  await refreshIndexAndQueue();
  const folderId = String(req.params.folderId);
  const folder = mediaIndex.foldersById.get(folderId);
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  const media = mediaIndex.getMediaForFolder(folderId);
  thumbnailService.prioritizeForFolder(media);
  res.json(media);
});

app.get("/thumbnails/:thumbFile", async (req, res) => {
  await refreshIndexAndQueue();
  const thumbFile = req.params.thumbFile;
  if (!thumbFile.endsWith(".jpg")) {
    res.status(400).json({ error: "Invalid thumbnail path" });
    return;
  }

  const mediaId = thumbFile.slice(0, -4);
  const media = mediaIndex.mediaById.get(mediaId);
  if (!media) {
    res.status(404).json({ error: "Media not found" });
    return;
  }

  const output = await thumbnailService.ensureThumbnail(media);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Type", "image/jpeg");
  res.sendFile(output);
});

app.get("/media/:mediaId/original", async (req, res) => {
  const mediaId = String(req.params.mediaId);
  const item = mediaIndex.mediaById.get(mediaId);
  if (!item) {
    res.status(404).json({ error: "Media not found" });
    return;
  }

  const rel = path.relative(config.mediaRootPath, item.absolutePath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.status(400).json({ error: "Invalid media path" });
    return;
  }

  res.setHeader("Content-Type", mime.lookup(item.name) || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename=\"${item.name}\"`);
  res.sendFile(item.absolutePath);
});

app.get("/media/:mediaId/resized", limiter, async (req, res) => {
  const mediaId = String(req.params.mediaId);
  const item = mediaIndex.mediaById.get(mediaId);
  if (!item) {
    res.status(404).json({ error: "Media not found" });
    return;
  }

  if (item.type !== "image") {
    res.redirect(`/media/${item.id}/original`);
    return;
  }

  const sizeMb = Number(req.query.sizeVmb ?? config.defaultImageResizeMb);
  const quality = Number(req.query.quality ?? config.defaultImageQuality);
  const safeSize = Number.isFinite(sizeMb) ? Math.min(Math.max(sizeMb, 1), 5) : config.defaultImageResizeMb;
  const safeQuality = Number.isFinite(quality) ? Math.min(Math.max(quality, 40), 95) : config.defaultImageQuality;

  const file = await resizeService.getOrCreateResizedImage(item, safeSize, safeQuality);
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Disposition", `attachment; filename=\"${path.parse(item.name).name}-resized.jpg\"`);
  res.sendFile(file);
});

app.post("/api/download", limiter, async (req, res) => {
  const body = req.body as {
    items?: Array<{ id: string; resizeMb: number | null }>;
  };

  if (!Array.isArray(body?.items)) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const downloads = body.items
    .map((item) => {
      const media = mediaIndex.mediaById.get(item.id);
      if (!media) {
        return null;
      }

      const resizeMb = item.resizeMb;
      const useResize = media.type === "image" && typeof resizeMb === "number";
      const url = useResize
        ? `/media/${media.id}/resized?sizeVmb=${Math.min(Math.max(resizeMb ?? config.defaultImageResizeMb, 1), 5)}&quality=${config.defaultImageQuality}`
        : `/media/${media.id}/original`;

      return {
        id: media.id,
        url,
        filename: media.name,
      };
    })
    .filter(Boolean);

  res.json({ downloads });
});

app.use(
  "/thumbnails",
  express.static(config.thumbsDir, {
    maxAge: "1d",
    setHeaders: (response) => {
      response.setHeader("Cache-Control", "public, max-age=86400");
    },
  }),
);

const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/media") || req.path.startsWith("/thumbnails")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function bootstrap() {
  appDb.init();
  settingsStore.ensureDefaults();
  await authService.bootstrapOwnerIfNeeded({
    username: config.bootstrapOwnerUsername,
    password: config.bootstrapOwnerPassword,
    displayName: config.bootstrapOwnerDisplayName,
  });

  await mediaIndex.init();
  await refreshIndexAndQueue();

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`Creator Share LAN running on port ${config.port}`);
    if (config.exposeToLan) {
      console.log("LAN mode enabled. Create firewall rule from FIREWALL_SETUP.md if needed.");
    }
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});

export { app };
