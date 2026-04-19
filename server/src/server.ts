import fs from "node:fs";
import path from "node:path";
import compression from "compression";
import cors from "cors";
import express from "express";
import mime from "mime-types";
import { loadConfig } from "./config";
import { MediaIndex } from "./media-index";
import { createTokenBucketRateLimiter } from "./rate-limit";
import { ResizeService } from "./resize";
import { ThumbnailService } from "./thumbnail-service";

const config = loadConfig();
const app = express();

const mediaIndex = new MediaIndex(config);
const thumbnailService = new ThumbnailService(config);
const resizeService = new ResizeService(config, thumbnailService);

const corsOrigin =
  config.corsAllowedOrigins.includes("*") || config.exposeToLan
    ? "*"
    : config.corsAllowedOrigins;

app.use(cors({ origin: corsOrigin }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));

const limiter = createTokenBucketRateLimiter(100, 100);

app.get("/health", async (_req, res) => {
  await mediaIndex.ensureFresh();
  res.json({
    version: "1.0.0",
    mediaCount: mediaIndex.mediaById.size,
    thumbnailsReady: fs.existsSync(config.thumbsDir),
  });
});

app.get("/api/folders", async (_req, res) => {
  await mediaIndex.ensureFresh();
  res.json(mediaIndex.folderTree);
});

app.get("/api/folders/:folderId/media", async (req, res) => {
  await mediaIndex.ensureFresh();
  const folderId = req.params.folderId;
  const folder = mediaIndex.foldersById.get(folderId);
  if (!folder) {
    res.status(404).json({ error: "Folder not found" });
    return;
  }
  const items = mediaIndex.mediaByFolderId.get(folderId);
  res.json(items ?? []);
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
  await mediaIndex.init();
  await thumbnailService.warm(Array.from(mediaIndex.mediaById.values()));

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
