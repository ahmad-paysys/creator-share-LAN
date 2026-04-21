import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPanel from "./AdminPanel";

vi.mock("../api", () => ({
  listAdminUsers: vi.fn(async () => ({
    users: [
      { id: "u1", username: "owner", displayName: "Owner", role: "owner" },
      { id: "u2", username: "viewer", displayName: "Viewer", role: "viewer" },
    ],
  })),
  fetchAdminSettings: vi.fn(async () => ({ folderViewPublic: true, libraryViewPublic: true, uiThemeDefault: "solar" })),
  listGalleries: vi.fn(async () => ({ galleries: [{ slug: "wedding", title: "Wedding", visibility: "private", updatedAt: "", itemCount: 1, description: null }] })),
  createAdminUser: vi.fn(async () => ({ user: { id: "u3", username: "newuser", displayName: null, role: "viewer" } })),
  updateAdminUserRole: vi.fn(async () => ({ user: { id: "u2", username: "viewer", displayName: "Viewer", role: "editor" } })),
  updateAdminSettings: vi.fn(async () => ({ folderViewPublic: false, libraryViewPublic: true, uiThemeDefault: "solar" })),
  createGallery: vi.fn(async () => ({ gallery: {} })),
  updateGalleryAccess: vi.fn(async () => ({ gallery: {} })),
  getGallery: vi.fn(async () => ({ gallery: { access: { roleShares: ["viewer"], userShares: ["viewer"] } } })),
  createTemporaryView: vi.fn(async () => ({ view: {} })),
  revokeTemporaryView: vi.fn(async () => ({ view: {} })),
}));

import { createAdminUser, createTemporaryView, updateAdminSettings } from "../api";

const defaultProps = {
  currentUser: { id: "u1", username: "owner", displayName: "Owner", role: "owner" as const },
  selectedMediaIds: ["m1", "m2"],
  globalThemeDefault: "solar" as const,
  activeTheme: "solar" as const,
  hasBrowserOverride: false,
  onClearThemeOverride: vi.fn(),
  onGlobalThemeUpdated: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminPanel", () => {
  it("allows admin to provision users", async () => {
    render(<AdminPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Provision Users")).toBeInTheDocument();
    });

    const usernameInput = screen.getByPlaceholderText("username");
    const passwordInput = screen.getByPlaceholderText("password");

    fireEvent.change(usernameInput, { target: { value: "newuser" } });
    fireEvent.change(passwordInput, { target: { value: "VeryStrongPassword1" } });
    fireEvent.click(screen.getByText("Create User"));

    await waitFor(() => {
      expect(createAdminUser).toHaveBeenCalled();
    });
  });

  it("supports visibility toggles and temporary view creation", async () => {
    render(<AdminPanel {...defaultProps} selectedMediaIds={["m1"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Visibility" }));
    await waitFor(() => {
      expect(screen.getByText("Library Visibility")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Save Visibility"));
    await waitFor(() => {
      expect(updateAdminSettings).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Temporary Links" }));

    fireEvent.change(screen.getByPlaceholderText("temporary slug"), { target: { value: "temp-1" } });
    fireEvent.change(screen.getByPlaceholderText("temporary title"), { target: { value: "Temporary" } });
    fireEvent.click(screen.getByText("Create Temporary View"));

    await waitFor(() => {
      expect(createTemporaryView).toHaveBeenCalled();
    });
  });

  it("shows access-denied hint for non-privileged roles", async () => {
    render(
      <AdminPanel
        currentUser={{ id: "u2", username: "viewer", displayName: "Viewer", role: "viewer" }}
        selectedMediaIds={[]}
        globalThemeDefault="solar"
        activeTheme="solar"
        hasBrowserOverride={false}
        onClearThemeOverride={vi.fn()}
        onGlobalThemeUpdated={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Only owner/admin can provision users.")).toBeInTheDocument();
    });
  });
});
