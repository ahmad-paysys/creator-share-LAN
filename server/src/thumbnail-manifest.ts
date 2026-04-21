import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export interface ThumbnailManifestEntry {
  mediaId: string;
  relativePath: string;
  sourceSize: number;
  sourceMtimeMs: number;
  settingsSignature: string;
  generatedAt: number;
}

interface ManifestFile {
  version: number;
  entries: ThumbnailManifestEntry[];
}

const MANIFEST_VERSION = 1;
const SAVE_DEBOUNCE_MS = 500;

export class ThumbnailManifest {
  private readonly entries = new Map<string, ThumbnailManifestEntry>();
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly manifestPath: string) {}

  public async load(): Promise<void> {
    if (!fs.existsSync(this.manifestPath)) {
      return;
    }

    try {
      const raw = await fsp.readFile(this.manifestPath, "utf8");
      const parsed = JSON.parse(raw) as ManifestFile;
      if (parsed.version !== MANIFEST_VERSION || !Array.isArray(parsed.entries)) {
        return;
      }
      for (const entry of parsed.entries) {
        this.entries.set(entry.mediaId, entry);
      }
    } catch {
      // Ignore malformed manifests and rebuild gradually.
    }
  }

  public get(mediaId: string): ThumbnailManifestEntry | undefined {
    return this.entries.get(mediaId);
  }

  public set(entry: ThumbnailManifestEntry): void {
    this.entries.set(entry.mediaId, entry);
    this.scheduleSave();
  }

  public delete(mediaId: string): void {
    if (this.entries.delete(mediaId)) {
      this.scheduleSave();
    }
  }

  public removeUnknown(validIds: Set<string>): void {
    let touched = false;
    for (const id of this.entries.keys()) {
      if (!validIds.has(id)) {
        this.entries.delete(id);
        touched = true;
      }
    }

    if (touched) {
      this.scheduleSave();
    }
  }

  public async flushNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveToDisk();
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      return;
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToDisk().catch(() => undefined);
    }, SAVE_DEBOUNCE_MS);
  }

  private async saveToDisk(): Promise<void> {
    await fsp.mkdir(path.dirname(this.manifestPath), { recursive: true });
    const data: ManifestFile = {
      version: MANIFEST_VERSION,
      entries: Array.from(this.entries.values()),
    };

    const tempPath = `${this.manifestPath}.tmp`;
    await fsp.writeFile(tempPath, JSON.stringify(data), "utf8");
    await fsp.rename(tempPath, this.manifestPath);
  }
}

