import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import type { AppConfig, MediaItem } from "./types/app";
import { ThumbnailManifest } from "./thumbnail-manifest";

interface QueueEntry {
  media: MediaItem;
  priority: number;
  sequence: number;
}

const IDLE_WAIT_MS = 150;
const THUMBNAIL_PIPELINE_VERSION = 1;

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
  private readonly mediaById = new Map<string, MediaItem>();
  private readonly manifest: ThumbnailManifest;
  private workersStarted = false;
  private initialized = false;
  private sequence = 0;
  private readonly settingsSignature: string;

  constructor(private readonly config: AppConfig) {
    this.manifest = new ThumbnailManifest(path.join(this.config.thumbnailCacheDir, "manifest.json"));
    this.settingsSignature = `v${THUMBNAIL_PIPELINE_VERSION}|size:${this.config.thumbnailSizePx}|q:${this.config.videoThumbnailQuality}|fit:cover|fmt:jpeg`;
  }

  public thumbnailPath(mediaId: string): string {
    return path.join(this.config.thumbsDir, `${mediaId}.jpg`);
  }

  public resizedPath(mediaId: string, sizeMb: number, quality: number): string {
    return path.join(this.config.resizedDir, `${mediaId}-${sizeMb}-${quality}.jpg`);
  }

  public async syncMediaCatalog(mediaItems: MediaItem[]): Promise<{ queued: number; stale: number; total: number }> {
    await this.initialize();
    this.ensureWorkers();

    this.mediaById.clear();
    for (const media of mediaItems) {
      this.mediaById.set(media.id, media);
    }

    this.manifest.removeUnknown(new Set(mediaItems.map((media) => media.id)));

    let staleCount = 0;
    let queuedCount = 0;
    for (const media of mediaItems) {
      if (!this.isStale(media)) {
        continue;
      }
      staleCount += 1;
      const depth = folderDepth(media.relativePath);
      if (this.enqueue(media, 100 + depth * 10)) {
        queuedCount += 1;
      }
    }

    return {
      queued: queuedCount,
      stale: staleCount,
      total: mediaItems.length,
    };
  }

  public prioritizeForFolder(mediaItems: MediaItem[]): void {
    this.ensureWorkers();
    for (const media of mediaItems) {
      const depth = folderDepth(media.relativePath);
      this.enqueue(media, depth);
    }
  }

  public getQueueStats(): { queued: number; active: number; tracked: number } {
    return {
      queued: this.queuedPriorities.size,
      active: this.activeJobs.size,
      tracked: this.mediaById.size,
    };
  }

  public async ensureThumbnail(media: MediaItem): Promise<string> {
    await this.initialize();
    this.mediaById.set(media.id, media);

    if (!this.isStale(media)) {
      return this.thumbnailPath(media.id);
    }

    await this.runJob(media);
    return this.thumbnailPath(media.id);
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.manifest.load();
    this.initialized = true;
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

  private enqueue(media: MediaItem, priority: number): boolean {
    if (!this.isStale(media)) {
      return false;
    }

    const existingPriority = this.queuedPriorities.get(media.id);
    if (typeof existingPriority === "number" && existingPriority <= priority) {
      return false;
    }

    this.queuedPriorities.set(media.id, priority);
    this.heapPush({ media, priority, sequence: this.sequence++ });
    return true;
  }

  private popNext(): QueueEntry | undefined {
    while (this.queue.length > 0) {
      const entry = this.heapPop();
      if (!entry) {
        return undefined;
      }
      if (this.queuedPriorities.get(entry.media.id) !== entry.priority) {
        continue;
      }

      this.queuedPriorities.delete(entry.media.id);
      return entry;
    }
    return undefined;
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

    const job = this.generateThumbnail(media).catch(() => undefined).finally(() => {
      this.activeJobs.delete(media.id);
    });
    this.activeJobs.set(media.id, job);
    return job;
  }

  private async generateThumbnail(media: MediaItem): Promise<void> {
    const output = this.thumbnailPath(media.id);
    if (!this.isStale(media)) {
      return;
    }

    if (media.type === "image") {
      await sharp(media.absolutePath)
        .resize(this.config.thumbnailSizePx, this.config.thumbnailSizePx, {
          fit: "cover",
          position: "centre",
          withoutEnlargement: true,
          fastShrinkOnLoad: true,
        })
        .jpeg({ quality: this.config.videoThumbnailQuality, progressive: true })
        .toFile(output);
      await this.persistManifestEntry(media);
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

    await this.persistManifestEntry(media);
  }

  private isStale(media: MediaItem): boolean {
    const output = this.thumbnailPath(media.id);
    if (!fs.existsSync(output)) {
      return true;
    }

    const entry = this.manifest.get(media.id);
    if (!entry) {
      return true;
    }

    const sourceMtimeMs = Date.parse(media.createdAt) || 0;
    if (entry.relativePath !== media.relativePath) {
      return true;
    }
    if (entry.sourceSize !== media.originalSize) {
      return true;
    }
    if (entry.sourceMtimeMs !== sourceMtimeMs) {
      return true;
    }
    if (entry.settingsSignature !== this.settingsSignature) {
      return true;
    }

    return false;
  }

  private async persistManifestEntry(media: MediaItem): Promise<void> {
    const sourceMtimeMs = Date.parse(media.createdAt) || 0;
    this.manifest.set({
      mediaId: media.id,
      relativePath: media.relativePath,
      sourceSize: media.originalSize,
      sourceMtimeMs,
      settingsSignature: this.settingsSignature,
      generatedAt: Date.now(),
    });
  }

  private heapPush(entry: QueueEntry): void {
    this.queue.push(entry);
    let index = this.queue.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compareEntries(this.queue[parent], this.queue[index]) <= 0) {
        break;
      }
      [this.queue[parent], this.queue[index]] = [this.queue[index], this.queue[parent]];
      index = parent;
    }
  }

  private heapPop(): QueueEntry | undefined {
    if (this.queue.length === 0) {
      return undefined;
    }

    const first = this.queue[0];
    const last = this.queue.pop();
    if (!last) {
      return first;
    }
    if (this.queue.length === 0) {
      return first;
    }

    this.queue[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < this.queue.length && this.compareEntries(this.queue[left], this.queue[smallest]) < 0) {
        smallest = left;
      }
      if (right < this.queue.length && this.compareEntries(this.queue[right], this.queue[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }

      [this.queue[index], this.queue[smallest]] = [this.queue[smallest], this.queue[index]];
      index = smallest;
    }

    return first;
  }

  private compareEntries(a: QueueEntry, b: QueueEntry): number {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return a.sequence - b.sequence;
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


