export interface VisibilitySettings {
  folderViewPublic: boolean;
  libraryViewPublic: boolean;
}

export type UiThemeProfile = "dark" | "light" | "solar";

export type AccessResource = "folder_library" | "sync_status";

export type AccessAction = "read";

export type AccessDecisionReason =
  | "ALLOW_OWNER"
  | "ALLOW_ADMIN"
  | "ALLOW_EDITOR"
  | "ALLOW_VIEWER"
  | "ALLOW_ANONYMOUS_PUBLIC"
  | "DENY_NON_LAN_ANONYMOUS"
  | "DENY_PRIVATE_SETTING"
  | "DENY_AUTH_REQUIRED"
  | "DENY_UNKNOWN_ROLE";

export interface AccessDecision {
  allowed: boolean;
  reason: AccessDecisionReason;
}
