import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "./database";
import { SettingsStore } from "./settings-store";

const tempDirs: string[] = [];

function setup(): { appDb: AppDatabase; settingsStore: SettingsStore } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creator-share-settings-"));
  tempDirs.push(dir);
  const appDb = new AppDatabase(path.join(dir, "settings.db"));
  appDb.init();
  const settingsStore = new SettingsStore(appDb.connection);
  settingsStore.ensureDefaults();
  return { appDb, settingsStore };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe("SettingsStore", () => {
  it("provides default visibility settings", () => {
    const { appDb, settingsStore } = setup();
    expect(settingsStore.getVisibilitySettings()).toEqual({
      folderViewPublic: true,
      libraryViewPublic: true,
    });
    appDb.close();
  });

  it("updates visibility settings", () => {
    const { appDb, settingsStore } = setup();
    const updated = settingsStore.updateVisibilitySettings({
      folderViewPublic: false,
      libraryViewPublic: false,
    });

    expect(updated).toEqual({
      folderViewPublic: false,
      libraryViewPublic: false,
    });
    appDb.close();
  });
});
