import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import chokidar from "chokidar";
import type { AppConfig, FolderNode, MediaItem } from "../types/app";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".heic", ".avif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"]);

function makeId(seed: string): string {
  return crypto.createHash("sha1").update(seed).digest("hex");
}

function isWithin(base: string, target: string): boolean {
  const relative = path.relative(base, target);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

interface BuildContext {
  folderTree: FolderNode;
  foldersById: Map<string, FolderNode>;
  mediaById: Map<string, MediaItem>;
  mediaByFolderId: Map<string, MediaItem[]>;
}

export class MediaIndex {
  private config: AppConfig;
  private dirty = false;
  private buildPromise: Promise<void> | null = null;
  private watcherStarted = false;
  private revision = 0;
  private lastRebuiltAt = Date.now();

  public folderTree: FolderNode = {
    id: "root",
    name: "Media",
    path: "",
    children: [],
    itemCount: 0,
    hasImages: false,
    hasVideos: false,
  };

  public foldersById = new Map<string, FolderNode>();
  public mediaById = new Map<string, MediaItem>();
  public mediaByFolderId = new Map<string, MediaItem[]>();

  constructor(config: AppConfig) {
    this.config = config;
  }

  public async init(): Promise<void> {
    await this.rebuild();

    if (!this.watcherStarted && this.config.recursiveScan) {
      const watcher = chokidar.watch(this.config.mediaRootPath, {
        ignoreInitial: true,
        persistent: true,
      });
      watcher.on("all", () => {
        this.dirty = true;
      });
      this.watcherStarted = true;
    }
  }

  public async ensureFresh(): Promise<boolean> {
    if (!this.dirty) {
      return false;
    }
    await this.rebuild();
    this.dirty = false;
    return true;
  }

  public getRevision(): number {
    return this.revision;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public getLastRebuiltAt(): number {
    return this.lastRebuiltAt;
  }

  public getMediaForFolder(folderId: string): MediaItem[] {
    const folder = this.foldersById.get(folderId);
    if (!folder) {
      return [];
    }

    const gathered: MediaItem[] = [];
    const stack: FolderNode[] = [folder];
    while (stack.length > 0) {
      const current = stack.pop()!;
      const direct = this.mediaByFolderId.get(current.id);
      if (direct?.length) {
        gathered.push(...direct);
      }
      if (current.children.length) {
        stack.push(...current.children);
      }
    }

    gathered.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return gathered;
  }

  private async rebuild(): Promise<void> {
    if (this.buildPromise) {
      return this.buildPromise;
    }

    this.buildPromise = this.buildInternal();
    try {
      await this.buildPromise;
    } finally {
      this.buildPromise = null;
    }
  }

  private async buildInternal(): Promise<void> {
    const context: BuildContext = {
      folderTree: {
        id: "root",
        name: path.basename(this.config.mediaRootPath) || "Media",
        path: "",
        children: [],
        itemCount: 0,
        hasImages: false,
        hasVideos: false,
      },
      foldersById: new Map<string, FolderNode>(),
      mediaById: new Map<string, MediaItem>(),
      mediaByFolderId: new Map<string, MediaItem[]>(),
    };

    context.foldersById.set("root", context.folderTree);

    await this.walkDirectory(this.config.mediaRootPath, "", context, context.folderTree);

    for (const items of context.mediaByFolderId.values()) {
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    this.folderTree = context.folderTree;
    this.foldersById = context.foldersById;
    this.mediaById = context.mediaById;
    this.mediaByFolderId = context.mediaByFolderId;
    this.revision += 1;
    this.lastRebuiltAt = Date.now();
  }

  private async walkDirectory(
    absoluteDir: string,
    relativeDir: string,
    context: BuildContext,
    parent: FolderNode,
  ): Promise<void> {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    const childDirs = entries.filter((entry) => entry.isDirectory());
    const childFiles = entries.filter((entry) => entry.isFile());

    for (const fileEntry of childFiles) {
      const extension = path.extname(fileEntry.name).toLowerCase();
      const type = IMAGE_EXTENSIONS.has(extension)
        ? "image"
        : VIDEO_EXTENSIONS.has(extension)
          ? "video"
          : null;
      if (!type) {
        continue;
      }

      const absPath = path.join(absoluteDir, fileEntry.name);
      if (!isWithin(this.config.mediaRootPath, absPath)) {
        continue;
      }

      const stat = await fs.stat(absPath);
      const relativePath = path.posix.join(relativeDir.replaceAll("\\", "/"), fileEntry.name).replace(/^\/+/, "");
      const id = makeId(relativePath);
      const media: MediaItem = {
        id,
        folderId: parent.id,
        relativePath,
        absolutePath: absPath,
        name: fileEntry.name,
        type,
        originalSize: stat.size,
        thumbnailUrl: `/thumbnails/${id}.jpg`,
        createdAt: stat.mtime.toISOString(),
      };

      context.mediaById.set(id, media);
      const list = context.mediaByFolderId.get(parent.id) ?? [];
      list.push(media);
      context.mediaByFolderId.set(parent.id, list);

      parent.itemCount += 1;
      parent.hasImages ||= type === "image";
      parent.hasVideos ||= type === "video";
    }

    for (const dirEntry of childDirs) {
      if (this.config.excludeFolders.includes(dirEntry.name)) {
        continue;
      }

      const nextRelative = path.posix
        .join(relativeDir.replaceAll("\\", "/"), dirEntry.name)
        .replace(/^\/+/, "");

      const topLevelName = nextRelative.split("/")[0];
      if (
        this.config.includeFolders[0] !== "*" &&
        !this.config.includeFolders.includes(topLevelName)
      ) {
        continue;
      }

      const folderPath = path.join(absoluteDir, dirEntry.name);
      if (!isWithin(this.config.mediaRootPath, folderPath)) {
        continue;
      }

      const folder: FolderNode = {
        id: makeId(`folder:${nextRelative}`),
        name: dirEntry.name,
        path: nextRelative,
        children: [],
        itemCount: 0,
        hasImages: false,
        hasVideos: false,
      };

      context.foldersById.set(folder.id, folder);
      parent.children.push(folder);

      await this.walkDirectory(folderPath, nextRelative, context, folder);

      parent.itemCount += folder.itemCount;
      parent.hasImages ||= folder.hasImages;
      parent.hasVideos ||= folder.hasVideos;
    }
  }
}


