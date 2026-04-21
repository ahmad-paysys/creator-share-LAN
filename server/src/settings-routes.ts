import type { Express, Request, Response } from "express";
import type { UiThemeProfile } from "./access-types";
import { AuditStore } from "./audit-store";
import { SettingsStore } from "./settings-store";

function requirePrivilegedUser(req: Request, res: Response): boolean {
  const role = req.auth?.user?.role;
  if (role === "owner" || role === "admin") {
    return true;
  }

  res.status(403).json({ error: "Forbidden" });
  return false;
}

export function registerSettingsRoutes(
  app: Express,
  settingsStore: SettingsStore,
  auditStore?: AuditStore,
): void {
  app.get("/api/settings", (_req, res) => {
    res.json({
      uiThemeDefault: settingsStore.getUiThemeDefault(),
    });
  });

  app.get("/api/admin/settings", (req, res) => {
    if (!requirePrivilegedUser(req, res)) {
      return;
    }

    res.json({
      ...settingsStore.getVisibilitySettings(),
      uiThemeDefault: settingsStore.getUiThemeDefault(),
    });
  });

  app.patch("/api/admin/settings", (req, res) => {
    if (!requirePrivilegedUser(req, res)) {
      return;
    }

    const payload = req.body as {
      folderViewPublic?: boolean;
      libraryViewPublic?: boolean;
      uiThemeDefault?: UiThemeProfile;
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

    if (
      payload.uiThemeDefault !== undefined &&
      payload.uiThemeDefault !== "dark" &&
      payload.uiThemeDefault !== "light" &&
      payload.uiThemeDefault !== "solar"
    ) {
      res.status(400).json({ error: "uiThemeDefault must be dark, light, or solar" });
      return;
    }

    const updated = settingsStore.updateVisibilitySettings(payload);
    const uiThemeDefault =
      payload.uiThemeDefault !== undefined
        ? settingsStore.updateUiThemeDefault(payload.uiThemeDefault)
        : settingsStore.getUiThemeDefault();

    auditStore?.insertEvent({
      actorType: "user",
      actorUserId: req.auth?.user?.id ?? null,
      action: "admin.settings.update",
      targetType: "settings",
      targetId: "visibility",
      result: "ok",
      meta: {
        folderViewPublic: updated.folderViewPublic,
        libraryViewPublic: updated.libraryViewPublic,
        uiThemeDefault,
      },
      requestIp: req.ip ?? null,
    });
    res.json({
      ...updated,
      uiThemeDefault,
    });
  });
}

