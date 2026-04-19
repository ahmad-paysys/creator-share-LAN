import fs from "node:fs";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import type { AppConfig, MediaItem } from "./types";

async function runWithConcurrency<T>(items: T[], limit: number, handler: (item: T) => Promise<void>) {
  const workers = Array.from({ length: Math.max(1, limit) }, async (_, workerIndex) => {
    for (let i = workerIndex; i < items.length; i += limit) {
      await handler(items[i]);
    }
  });
  await Promise.all(workers);
}

export class ThumbnailService {
  constructor(private readonly config: AppConfig) {}

  public thumbnailPath(mediaId: string): string {
    return path.join(this.config.thumbsDir, `${mediaId}.jpg`);
  }

  public resizedPath(mediaId: string, sizeMb: number, quality: number): string {
    return path.join(this.config.resizedDir, `${mediaId}-${sizeMb}-${quality}.jpg`);
  }

  public async warm(mediaItems: MediaItem[]): Promise<void> {
    await runWithConcurrency(mediaItems, this.config.maxConcurrentResizeJobs, async (media) => {
      const output = this.thumbnailPath(media.id);
      if (fs.existsSync(output)) {
        return;
      }
      if (media.type === "image") {
        await sharp(media.absolutePath)
          .resize(this.config.thumbnailSizePx, this.config.thumbnailSizePx, {
            fit: "cover",
            position: "centre",
          })
          .jpeg({ quality: this.config.videoThumbnailQuality, progressive: true })
          .toFile(output);
        return;
      }

      await this.extractVideoFrame(media.absolutePath, output).catch(async () => {
        await sharp({
          create: {
            width: this.config.thumbnailSizePx,
            height: this.config.thumbnailSizePx,
            channels: 3,
            background: "#1a1a1a",
          },
        })
          .jpeg({ quality: 70 })
          .toFile(output);
      });
    });
  }

  private async extractVideoFrame(input: string, output: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(input)
        .seekInput(this.config.videoFrameTimestamp)
        .frames(1)
        .outputOptions(["-q:v", String(Math.max(2, 31 - Math.floor(this.config.videoThumbnailQuality / 4)))])
        .output(output)
        .on("end", () => resolve())
        .on("error", reject)
        .run();
    });
  }
}
