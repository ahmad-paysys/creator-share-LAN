import { describe, expect, it } from "vitest";
import { evaluateAccess } from "./access-policy";
import type { SafeUser } from "./auth-types";
import type { VisibilitySettings } from "./access-types";

const publicSettings: VisibilitySettings = {
  folderViewPublic: true,
  libraryViewPublic: true,
};

const privateSettings: VisibilitySettings = {
  folderViewPublic: false,
  libraryViewPublic: false,
};

function makeUser(role: SafeUser["role"]): SafeUser {
  return {
    id: "user-1",
    username: "user",
    displayName: null,
    role,
  };
}

describe("evaluateAccess", () => {
  it("allows all authenticated roles for read", () => {
    const roles: SafeUser["role"][] = ["owner", "admin", "editor", "viewer"];

    const reasons = new Set<string>();
    for (const role of roles) {
      const decision = evaluateAccess({
        user: makeUser(role),
        resource: "folder_library",
        action: "read",
        isLan: true,
        settings: privateSettings,
      });

      expect(decision.allowed).toBe(true);
      reasons.add(decision.reason);
    }

    expect(reasons).toEqual(new Set(["ALLOW_OWNER", "ALLOW_ADMIN", "ALLOW_EDITOR", "ALLOW_VIEWER"]));
  });

  it("denies anonymous non-LAN access", () => {
    const decision = evaluateAccess({
      user: null,
      resource: "folder_library",
      action: "read",
      isLan: false,
      settings: publicSettings,
    });

    expect(decision).toEqual({
      allowed: false,
      reason: "DENY_NON_LAN_ANONYMOUS",
    });
  });

  it("enforces private setting for anonymous access", () => {
    const decision = evaluateAccess({
      user: null,
      resource: "folder_library",
      action: "read",
      isLan: true,
      settings: privateSettings,
    });

    expect(decision).toEqual({
      allowed: false,
      reason: "DENY_PRIVATE_SETTING",
    });
  });

  it("allows anonymous LAN access when settings are public", () => {
    const decision = evaluateAccess({
      user: null,
      resource: "folder_library",
      action: "read",
      isLan: true,
      settings: publicSettings,
    });

    expect(decision).toEqual({
      allowed: true,
      reason: "ALLOW_ANONYMOUS_PUBLIC",
    });
  });
});

