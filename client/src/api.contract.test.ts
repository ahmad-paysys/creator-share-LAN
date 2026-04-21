import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminUser,
  createTemporaryView,
  updateAdminSettings,
  updateGalleryAccess,
  updateAdminUserRole,
} from "./api";

describe("api contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "cookie", {
      value: "creator_csrf=test-csrf-token",
      configurable: true,
    });
  });

  it("sends correct contract for admin settings updates", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ folderViewPublic: true, libraryViewPublic: false }), { status: 200 }),
    );

    await updateAdminSettings({ folderViewPublic: true, libraryViewPublic: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/settings",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.any(Headers),
      }),
    );

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Headers;
    expect(headers.get("x-csrf-token")).toBe("test-csrf-token");
  });

  it("sends user provisioning and role assignment requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ user: { id: "1", username: "new", role: "viewer", displayName: null } }), {
        status: 200,
      }),
    );

    await createAdminUser({ username: "new", password: "VeryStrongPassword1", role: "viewer" });
    await updateAdminUserRole("1", "editor");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users/1",
      expect.objectContaining({ method: "PATCH", headers: expect.any(Headers) }),
    );
  });

  it("sends gallery sharing and temporary view payloads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ gallery: {}, view: {} }), { status: 200 }),
    );

    await updateGalleryAccess({ slug: "private-a", roleShares: ["viewer"], userShares: ["alice"] });
    await createTemporaryView({
      slug: "v1",
      title: "View One",
      visibility: "private",
      expiresInHours: 24,
      mediaIds: ["m1"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/gallery/private-a/access",
      expect.objectContaining({ method: "PATCH", headers: expect.any(Headers) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/views",
      expect.objectContaining({ method: "POST", headers: expect.any(Headers) }),
    );
  });
});
