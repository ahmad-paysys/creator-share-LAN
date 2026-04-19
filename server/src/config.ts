import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import type { AppConfig } from "./types";

const DEFAULTS = {
  PORT: 3000,
  DEFAULT_IMAGE_RESIZE_MB: 2,
  DEFAULT_IMAGE_QUALITY: 80,
  THUMBNAIL_SIZE_PX: 280,
  VIDEO_THUMBNAIL_QUALITY: 80,
  VIDEO_FRAME_TIMESTAMP: "00:00:05",
  MEDIA_ROOT_PATH: "./media",
  INCLUDE_FOLDERS: "*",
  EXCLUDE_FOLDERS: ".git,.cache,node_modules,__pycache__",
  RECURSIVE_SCAN: "true",
  MAX_CONCURRENT_RESIZE_JOBS: 4,
  THUMBNAIL_CACHE_DIR: "./cache/thumbnails",
  EXPOSE_TO_LAN: "true",
  CORS_ALLOWED_ORIGINS: "*",
  VITE_API_BASE_URL: "http://localhost:3000",
  VITE_MAX_THUMBNAIL_RESOLUTION: "1920x1080",
};

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 5; i += 1) {
    const hasClient = fs.existsSync(path.join(current, "client"));
    const hasServer = fs.existsSync(path.join(current, "server"));
    const hasPackage = fs.existsSync(path.join(current, "package.json"));
    if (hasClient && hasServer && hasPackage) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return startDir;
}

function resolveConfigPath(rawPath: string, baseDir: string): string {
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(baseDir, rawPath);
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBool(value: string): boolean {
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function loadConfig(): AppConfig {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const localEnv = path.resolve(process.cwd(), ".env");
  const parentEnv = path.resolve(workspaceRoot, ".env");
  if (fs.existsSync(localEnv)) {
    dotenv.config({ path: localEnv });
  } else if (fs.existsSync(parentEnv)) {
    dotenv.config({ path: parentEnv });
  } else {
    dotenv.config();
  }

  const mediaRootPath = resolveConfigPath(
    process.env.MEDIA_ROOT_PATH ?? DEFAULTS.MEDIA_ROOT_PATH,
    workspaceRoot,
  );
  const thumbnailCacheDir = resolveConfigPath(
    process.env.THUMBNAIL_CACHE_DIR ?? DEFAULTS.THUMBNAIL_CACHE_DIR,
    workspaceRoot,
  );

  if (!fs.existsSync(mediaRootPath)) {
    fs.mkdirSync(mediaRootPath, { recursive: true });
  }
  if (!fs.statSync(mediaRootPath).isDirectory()) {
    throw new Error(`MEDIA_ROOT_PATH is not a directory: ${mediaRootPath}`);
  }

  const thumbsDir = path.join(thumbnailCacheDir, "thumbs");
  const resizedDir = path.join(thumbnailCacheDir, "resized");
  fs.mkdirSync(thumbsDir, { recursive: true });
  fs.mkdirSync(resizedDir, { recursive: true });

  const corsAllowedOriginsRaw = process.env.CORS_ALLOWED_ORIGINS ?? DEFAULTS.CORS_ALLOWED_ORIGINS;
  const corsAllowedOrigins = corsAllowedOriginsRaw === "*" ? ["*"] : parseList(corsAllowedOriginsRaw);

  return {
    apiBaseUrl: process.env.VITE_API_BASE_URL ?? DEFAULTS.VITE_API_BASE_URL,
    maxThumbnailResolution:
      process.env.VITE_MAX_THUMBNAIL_RESOLUTION ?? DEFAULTS.VITE_MAX_THUMBNAIL_RESOLUTION,
    port: Number(process.env.PORT ?? DEFAULTS.PORT),
    nodeEnv: process.env.NODE_ENV ?? "production",
    defaultImageResizeMb: Number(process.env.DEFAULT_IMAGE_RESIZE_MB ?? DEFAULTS.DEFAULT_IMAGE_RESIZE_MB),
    defaultImageQuality: Number(process.env.DEFAULT_IMAGE_QUALITY ?? DEFAULTS.DEFAULT_IMAGE_QUALITY),
    thumbnailSizePx: Number(process.env.THUMBNAIL_SIZE_PX ?? DEFAULTS.THUMBNAIL_SIZE_PX),
    videoThumbnailQuality: Number(process.env.VIDEO_THUMBNAIL_QUALITY ?? DEFAULTS.VIDEO_THUMBNAIL_QUALITY),
    videoFrameTimestamp: process.env.VIDEO_FRAME_TIMESTAMP ?? DEFAULTS.VIDEO_FRAME_TIMESTAMP,
    mediaRootPath,
    includeFolders: parseList(process.env.INCLUDE_FOLDERS ?? DEFAULTS.INCLUDE_FOLDERS),
    excludeFolders: parseList(process.env.EXCLUDE_FOLDERS ?? DEFAULTS.EXCLUDE_FOLDERS),
    recursiveScan: parseBool(process.env.RECURSIVE_SCAN ?? DEFAULTS.RECURSIVE_SCAN),
    maxConcurrentResizeJobs: Number(
      process.env.MAX_CONCURRENT_RESIZE_JOBS ?? DEFAULTS.MAX_CONCURRENT_RESIZE_JOBS,
    ),
    thumbnailCacheDir,
    thumbsDir,
    resizedDir,
    exposeToLan: parseBool(process.env.EXPOSE_TO_LAN ?? DEFAULTS.EXPOSE_TO_LAN),
    corsAllowedOrigins,
  };
}
