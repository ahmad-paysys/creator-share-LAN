import fs from "node:fs";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import type { AppConfig, MediaItem } from "./types";

interface QueueEntry {
  media: MediaItem;
  priority: number;
  sequence: number;
}

const IDLE_WAIT_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function folderDepth(relativePath: string): number {
  if (!relativePath.includes("/")) {
    return 0;
  }
  return relativePath.split("/").length - 2;
}

export class ThumbnailService {
  private readonly queue: QueueEntry[] = [];
  private readonly queuedPriorities = new Map<string, number>();
  private readonly activeJobs = new Map<string, Promise<void>>();
  private workersStarted = false;
  private sequence = 0;

  constructor(private readonly config: AppConfig) {}

  public thumbnailPath(mediaId: string): string {
    return path.join(this.config.thumbsDir, `${mediaId}.jpg`);
  }

  public resizedPath(mediaId: string, sizeMb: number, quality: number): string {
    return path.join(this.config.resizedDir, `${mediaId}-${sizeMb}-${quality}.jpg`);
  }

  public startBackgroundProcessing(mediaItems: MediaItem[]): void {
    this.ensureWorkers();
    for (const media of mediaItems) {
      const depth = folderDepth(media.relativePath);
      this.enqueue(media, 100 + depth * 10);
    }
  }

  public prioritizeForFolder(mediaItems: MediaItem[]): void {
    this.ensureWorkers();
    for (const media of mediaItems) {
      const depth = folderDepth(media.relativePath);
      this.enqueue(media, depth);
    }
  }

  public async ensureThumbnail(media: MediaItem): Promise<string> {
    const output = this.thumbnailPath(media.id);
    if (fs.existsSync(output)) {
      return output;
    }

    await this.runJob(media);
    return output;
  }

  private ensureWorkers(): void {
    if (this.workersStarted) {
      return;
    }

    this.workersStarted = true;
    const workers = Math.max(1, this.config.maxConcurrentResizeJobs);
    for (let i = 0; i < workers; i += 1) {
      this.workerLoop().catch(() => undefined);
    }
  }

  private enqueue(media: MediaItem, priority: number): void {
    const output = this.thumbnailPath(media.id);
    if (fs.existsSync(output)) {
      return;
    }

    const existingPriority = this.queuedPriorities.get(media.id);
    if (typeof existingPriority === "number" && existingPriority <= priority) {
      return;
    }

    this.queuedPriorities.set(media.id, priority);
    this.queue.push({
      media,
      priority,
      sequence: this.sequence++,
    });
  }

  private popNext(): QueueEntry | undefined {
    if (this.queue.length === 0) {
      return undefined;
    }

    let bestIndex = 0;
    for (let i = 1; i < this.queue.length; i += 1) {
      const current = this.queue[i];
      const best = this.queue[bestIndex];
      if (current.priority < best.priority || (current.priority === best.priority && current.sequence < best.sequence)) {
        bestIndex = i;
      }
    }

    const [entry] = this.queue.splice(bestIndex, 1);
    if (this.queuedPriorities.get(entry.media.id) !== entry.priority) {
      return undefined;
    }

    this.queuedPriorities.delete(entry.media.id);
    return entry;
  }

  private async workerLoop(): Promise<void> {
    while (true) {
      const next = this.popNext();
      if (!next) {
        await delay(IDLE_WAIT_MS);
        continue;
      }

      await this.runJob(next.media).catch(() => undefined);
    }
  }

  private runJob(media: MediaItem): Promise<void> {
    const existing = this.activeJobs.get(media.id);
    if (existing) {
      return existing;
    }

    const job = this.generateThumbnail(media).finally(() => {
      this.activeJobs.delete(media.id);
    });
    this.activeJobs.set(media.id, job);
    return job;
  }

  private async generateThumbnail(media: MediaItem): Promise<void> {
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
