import type { SafeUser } from "../auth/types";
import type { AccessAction, AccessDecision, AccessResource, VisibilitySettings } from "./types";

function evaluateAuthenticated(user: SafeUser): AccessDecision {
  if (user.role === "owner") {
    return { allowed: true, reason: "ALLOW_OWNER" };
  }
  if (user.role === "admin") {
    return { allowed: true, reason: "ALLOW_ADMIN" };
  }
  if (user.role === "editor") {
    return { allowed: true, reason: "ALLOW_EDITOR" };
  }
  if (user.role === "viewer") {
    return { allowed: true, reason: "ALLOW_VIEWER" };
  }

  return { allowed: false, reason: "DENY_UNKNOWN_ROLE" };
}

function isPublicBySettings(resource: AccessResource, settings: VisibilitySettings): boolean {
  if (resource === "sync_status") {
    return settings.libraryViewPublic;
  }

  return settings.libraryViewPublic && settings.folderViewPublic;
}

export function evaluateAccess(input: {
  user: SafeUser | null;
  resource: AccessResource;
  action: AccessAction;
  isLan: boolean;
  settings: VisibilitySettings;
}): AccessDecision {
  if (input.action !== "read") {
    return { allowed: false, reason: "DENY_AUTH_REQUIRED" };
  }

  if (input.user) {
    return evaluateAuthenticated(input.user);
  }

  if (!input.isLan) {
    return { allowed: false, reason: "DENY_NON_LAN_ANONYMOUS" };
  }

  if (!isPublicBySettings(input.resource, input.settings)) {
    return { allowed: false, reason: "DENY_PRIVATE_SETTING" };
  }

  return { allowed: true, reason: "ALLOW_ANONYMOUS_PUBLIC" };
}


