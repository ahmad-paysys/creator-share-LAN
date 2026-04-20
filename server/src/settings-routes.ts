import type { Express, Request, Response } from "express";
import { SettingsStore } from "./settings-store";

function requirePrivilegedUser(req: Request, res: Response): boolean {
  const role = req.auth?.user?.role;
  if (role === "owner" || role === "admin") {
    return true;
  }

  res.status(403).json({ error: "Forbidden" });
  return false;
}

export function registerSettingsRoutes(app: Express, settingsStore: SettingsStore): void {
  app.get("/api/admin/settings", (req, res) => {
    if (!requirePrivilegedUser(req, res)) {
      return;
    }

    res.json(settingsStore.getVisibilitySettings());
  });

  app.patch("/api/admin/settings", (req, res) => {
    if (!requirePrivilegedUser(req, res)) {
      return;
    }

    const payload = req.body as {
      folderViewPublic?: boolean;
      libraryViewPublic?: boolean;
    };

    if (
      payload.folderViewPublic !== undefined &&
      typeof payload.folderViewPublic !== "boolean"
    ) {
      res.status(400).json({ error: "folderViewPublic must be a boolean" });
      return;
    }

    if (
      payload.libraryViewPublic !== undefined &&
      typeof payload.libraryViewPublic !== "boolean"
    ) {
      res.status(400).json({ error: "libraryViewPublic must be a boolean" });
      return;
    }

    const updated = settingsStore.updateVisibilitySettings(payload);
    res.json(updated);
  });
}
