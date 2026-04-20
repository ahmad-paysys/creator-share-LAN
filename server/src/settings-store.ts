import Database from "better-sqlite3";
import type { VisibilitySettings } from "./access-types";

const KEY_FOLDER_VIEW_PUBLIC = "folder_view_public";
const KEY_LIBRARY_VIEW_PUBLIC = "library_view_public";

function toStoredBoolean(value: boolean): string {
  return JSON.stringify(value);
}

function parseStoredBoolean(raw: string | null | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "boolean" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export class SettingsStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public ensureDefaults(): void {
    this.ensureBooleanSetting(KEY_FOLDER_VIEW_PUBLIC, true);
    this.ensureBooleanSetting(KEY_LIBRARY_VIEW_PUBLIC, true);
  }

  public getVisibilitySettings(): VisibilitySettings {
    return {
      folderViewPublic: this.getBooleanSetting(KEY_FOLDER_VIEW_PUBLIC, true),
      libraryViewPublic: this.getBooleanSetting(KEY_LIBRARY_VIEW_PUBLIC, true),
    };
  }

  public updateVisibilitySettings(input: {
    folderViewPublic?: boolean;
    libraryViewPublic?: boolean;
  }): VisibilitySettings {
    const now = new Date().toISOString();

    if (typeof input.folderViewPublic === "boolean") {
      this.db
        .prepare("UPDATE settings SET value_json = ?, updated_at = ? WHERE key = ?")
        .run(toStoredBoolean(input.folderViewPublic), now, KEY_FOLDER_VIEW_PUBLIC);
    }

    if (typeof input.libraryViewPublic === "boolean") {
      this.db
        .prepare("UPDATE settings SET value_json = ?, updated_at = ? WHERE key = ?")
        .run(toStoredBoolean(input.libraryViewPublic), now, KEY_LIBRARY_VIEW_PUBLIC);
    }

    return this.getVisibilitySettings();
  }

  private ensureBooleanSetting(key: string, value: boolean): void {
    this.db
      .prepare(
        `INSERT INTO settings(key, value_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO NOTHING`,
      )
      .run(key, toStoredBoolean(value), new Date().toISOString());
  }

  private getBooleanSetting(key: string, fallback: boolean): boolean {
    const row = this.db
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get(key) as { value_json: string } | undefined;

    return parseStoredBoolean(row?.value_json, fallback);
  }
}
