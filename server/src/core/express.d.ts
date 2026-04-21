declare namespace Express {
  export interface Request {
    auth?: {
      sessionToken: string | null;
      user:
        | {
            id: string;
            username: string;
            displayName: string | null;
            role: "owner" | "admin" | "editor" | "viewer";
          }
        | null;
    };
    authz?: {
      decision: {
        allowed: boolean;
        reason:
          | "ALLOW_OWNER"
          | "ALLOW_ADMIN"
          | "ALLOW_EDITOR"
          | "ALLOW_VIEWER"
          | "ALLOW_ANONYMOUS_PUBLIC"
          | "DENY_NON_LAN_ANONYMOUS"
          | "DENY_PRIVATE_SETTING"
          | "DENY_AUTH_REQUIRED"
          | "DENY_UNKNOWN_ROLE";
      };
      resource: "folder_library" | "sync_status";
    };
  }
}
