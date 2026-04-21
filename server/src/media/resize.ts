import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AppConfig, MediaItem } from "../types/app";
import { ThumbnailService } from "./thumbnail-service";

const ONE_HOUR_MS = 60 * 60 * 1000;
const MAX_CACHE_BYTES = 5 * 1024 * 1024 * 1024;

export function estimateResizeDimensions(
  width: number,
  height: number,
  currentBytes: number,
  targetMb: number,
): { width: number; height: number } {
  const targetBytes = Math.max(256 * 1024, targetMb * 1024 * 1024);
  const ratio = Math.min(1, Math.sqrt(targetBytes / Math.max(currentBytes, 1)));
  return {
    width: Math.max(320, Math.floor(width * ratio)),
    height: Math.max(240, Math.floor(height * ratio)),
  };
}

export class ResizeService {
  constructor(
    private readonly config: AppConfig,
    private readonly thumbnailService: ThumbnailService,
  ) {}

  public async getOrCreateResizedImage(
    media: MediaItem,
    sizeMb: number,
    quality: number,
  ): Promise<string> {
    const cachePath = this.thumbnailService.resizedPath(media.id, sizeMb, quality);
    const now = Date.now();

    try {
      const stat = await fs.stat(cachePath);
      if (now - stat.mtimeMs < ONE_HOUR_MS) {
        return cachePath;
      }
    } catch {
      // Cache miss.
    }

    const meta = await sharp(media.absolutePath).metadata();
    const sourceWidth = meta.width ?? 1920;
    const sourceHeight = meta.height ?? 1080;
    const dims = estimateResizeDimensions(sourceWidth, sourceHeight, media.originalSize, sizeMb);

    await sharp(media.absolutePath)
      .resize(dims.width, dims.height, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, progressive: true })
      .toFile(cachePath);

    await this.evictIfNeeded();
    return cachePath;
  }

  private async evictIfNeeded(): Promise<void> {
    const files = await fs.readdir(this.config.resizedDir);
    const stats = await Promise.all(
      files.map(async (name) => {
        const filePath = path.join(this.config.resizedDir, name);
        const stat = await fs.stat(filePath);
        return { filePath, size: stat.size, atimeMs: stat.atimeMs };
      }),
    );

    let total = stats.reduce((sum, entry) => sum + entry.size, 0);
    if (total <= MAX_CACHE_BYTES) {
      return;
    }

    stats.sort((a, b) => a.atimeMs - b.atimeMs);
    for (const item of stats) {
      if (total <= MAX_CACHE_BYTES) {
        break;
      }
      await fs.unlink(item.filePath).catch(() => undefined);
      total -= item.size;
    }
  }
}


