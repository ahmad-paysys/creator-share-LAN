import type { NextFunction, Request, Response } from "express";
import { evaluateAccess } from "./access-policy";
import type { AccessResource } from "./access-types";
import { isLanIp } from "./lan-access";
import { SettingsStore } from "./settings-store";

export function requireReadAccess(settingsStore: SettingsStore, resource: AccessResource) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const settings = settingsStore.getVisibilitySettings();
    const decision = evaluateAccess({
      user: req.auth?.user ?? null,
      resource,
      action: "read",
      isLan: isLanIp(req.ip),
      settings,
    });

    req.authz = {
      decision,
      resource,
    };

    res.setHeader("X-Authz-Reason", decision.reason);

    if (!decision.allowed) {
      console.warn(`[AUTHZ] denied resource=${resource} reason=${decision.reason} path=${req.path}`);
      const status = decision.reason === "DENY_NON_LAN_ANONYMOUS" ? 403 : 401;
      res.status(status).json({
        error: "Access denied",
        reason: decision.reason,
      });
      return;
    }

    console.info(`[AUTHZ] allowed resource=${resource} reason=${decision.reason} path=${req.path}`);
    next();
  };
}
