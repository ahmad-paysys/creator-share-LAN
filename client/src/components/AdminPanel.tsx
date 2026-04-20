import { useEffect, useMemo, useState } from "react";
import {
  createAdminUser,
  createGallery,
  createTemporaryView,
  fetchAdminSettings,
  getGallery,
  listAdminUsers,
  listGalleries,
  revokeTemporaryView,
  updateAdminSettings,
  updateAdminUserRole,
  updateGalleryAccess,
} from "../api";
import type { SafeUser, UserRole } from "../types";

interface AdminPanelProps {
  currentUser: SafeUser;
  selectedMediaIds: string[];
}

const ROLE_OPTIONS: UserRole[] = ["owner", "admin", "editor", "viewer"];

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function AdminPanel({ currentUser, selectedMediaIds }: AdminPanelProps) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<SafeUser[]>([]);
  const [settings, setSettings] = useState({ folderViewPublic: true, libraryViewPublic: true });
  const [gallerySlugs, setGallerySlugs] = useState<string[]>([]);

  const [newUser, setNewUser] = useState({ username: "", password: "", displayName: "", role: "viewer" as UserRole });
  const [newGallery, setNewGallery] = useState({ slug: "", title: "", visibility: "private" as "public" | "private" });
  const [shareForm, setShareForm] = useState({ slug: "", roleShares: "viewer", userShares: "" });

  const [viewForm, setViewForm] = useState({
    slug: "",
    title: "",
    visibility: "public" as "public" | "private",
    expiresInHours: 24,
    gallerySlug: "",
  });
  const [revokeSlug, setRevokeSlug] = useState("");

  const canManageUsers = currentUser.role === "owner" || currentUser.role === "admin";

  const refresh = async () => {
    const [userResp, settingsResp, galleriesResp] = await Promise.all([
      listAdminUsers(),
      fetchAdminSettings(),
      listGalleries(),
    ]);

    setUsers(userResp.users);
    setSettings(settingsResp);
    setGallerySlugs(galleriesResp.galleries.map((entry) => entry.slug));

    if (!shareForm.slug && galleriesResp.galleries.length > 0) {
      setShareForm((prev) => ({ ...prev, slug: galleriesResp.galleries[0].slug }));
    }
  };

  useEffect(() => {
    refresh().catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Could not load admin panel data");
    });
  }, []);

  const selectedPreview = useMemo(() => selectedMediaIds.slice(0, 6), [selectedMediaIds]);

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await action();
      setStatus(successMessage);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-3xl p-4 text-sm text-white shadow-lg shadow-black/20">
      <h3 className="text-lg font-semibold">Admin Access Control</h3>
      <p className="mt-1 text-xs text-white/70">Signed in as {currentUser.username} ({currentUser.role})</p>

      {status && <div className="mt-3 rounded-xl border border-mint/60 bg-mint/15 px-3 py-2 text-xs">{status}</div>}
      {error && <div className="mt-3 rounded-xl border border-coral/70 bg-coral/15 px-3 py-2 text-xs">{error}</div>}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/15 bg-white/5 p-3">
          <h4 className="font-semibold">Provision Users</h4>
          {!canManageUsers && <p className="mt-2 text-xs text-sand">Only owner/admin can provision users.</p>}
          <div className="mt-2 grid gap-2">
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="username"
              value={newUser.username}
              onChange={(event) => setNewUser((prev) => ({ ...prev, username: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              type="password"
              placeholder="password"
              value={newUser.password}
              onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="display name (optional)"
              value={newUser.displayName}
              onChange={(event) => setNewUser((prev) => ({ ...prev, displayName: event.target.value }))}
            />
            <select
              className="rounded-lg bg-black/20 px-2 py-1"
              value={newUser.role}
              onChange={(event) => setNewUser((prev) => ({ ...prev, role: event.target.value as UserRole }))}
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <button
              className="rounded-lg bg-white/20 px-3 py-2 text-left hover:bg-white/30 disabled:opacity-40"
              disabled={!canManageUsers || busy}
              onClick={() => {
                runAction(async () => {
                  await createAdminUser({
                    username: newUser.username.trim(),
                    password: newUser.password,
                    displayName: newUser.displayName.trim() || undefined,
                    role: newUser.role,
                  });
                  setNewUser({ username: "", password: "", displayName: "", role: "viewer" });
                  await refresh();
                }, "User created.");
              }}
            >
              Create User
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-white/10 px-2 py-1">
                <div>
                  <p className="font-medium">{user.username}</p>
                  <p className="text-xs text-white/65">{user.displayName || "No display name"}</p>
                </div>
                <select
                  aria-label={`role-${user.username}`}
                  className="rounded-md bg-black/30 px-2 py-1"
                  value={user.role}
                  disabled={!canManageUsers || busy}
                  onChange={(event) => {
                    const nextRole = event.target.value as UserRole;
                    runAction(async () => {
                      await updateAdminUserRole(user.id, nextRole);
                      await refresh();
                    }, `Updated ${user.username} role to ${nextRole}.`);
                  }}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/15 bg-white/5 p-3">
          <h4 className="font-semibold">Library Visibility</h4>
          <div className="mt-2 grid gap-2 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.folderViewPublic}
                onChange={(event) => setSettings((prev) => ({ ...prev, folderViewPublic: event.target.checked }))}
              />
              Folder view public
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.libraryViewPublic}
                onChange={(event) => setSettings((prev) => ({ ...prev, libraryViewPublic: event.target.checked }))}
              />
              Library view public
            </label>
            <button
              className="rounded-lg bg-white/20 px-3 py-2 text-left hover:bg-white/30 disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                runAction(async () => {
                  const updated = await updateAdminSettings(settings);
                  setSettings(updated);
                }, "Visibility settings saved.");
              }}
            >
              Save Visibility
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/15 bg-white/5 p-3">
          <h4 className="font-semibold">Gallery Sharing</h4>
          <div className="mt-2 grid gap-2">
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="new gallery slug"
              value={newGallery.slug}
              onChange={(event) => setNewGallery((prev) => ({ ...prev, slug: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="new gallery title"
              value={newGallery.title}
              onChange={(event) => setNewGallery((prev) => ({ ...prev, title: event.target.value }))}
            />
            <select
              className="rounded-lg bg-black/20 px-2 py-1"
              value={newGallery.visibility}
              onChange={(event) => setNewGallery((prev) => ({ ...prev, visibility: event.target.value as "public" | "private" }))}
            >
              <option value="private">private</option>
              <option value="public">public</option>
            </select>
            <button
              className="rounded-lg bg-white/20 px-3 py-2 text-left hover:bg-white/30 disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                runAction(async () => {
                  await createGallery(newGallery);
                  setNewGallery({ slug: "", title: "", visibility: "private" });
                  await refresh();
                }, "Gallery created.");
              }}
            >
              Create Gallery
            </button>
          </div>

          <div className="mt-3 grid gap-2">
            <select
              className="rounded-lg bg-black/20 px-2 py-1"
              value={shareForm.slug}
              onChange={(event) => setShareForm((prev) => ({ ...prev, slug: event.target.value }))}
            >
              <option value="">choose gallery</option>
              {gallerySlugs.map((slug) => (
                <option key={slug} value={slug}>{slug}</option>
              ))}
            </select>
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="role shares (csv): viewer,editor"
              value={shareForm.roleShares}
              onChange={(event) => setShareForm((prev) => ({ ...prev, roleShares: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="user shares usernames (csv)"
              value={shareForm.userShares}
              onChange={(event) => setShareForm((prev) => ({ ...prev, userShares: event.target.value }))}
            />
            <button
              className="rounded-lg bg-white/20 px-3 py-2 text-left hover:bg-white/30 disabled:opacity-40"
              disabled={busy || !shareForm.slug}
              onClick={() => {
                runAction(async () => {
                  const roleShares = parseCsv(shareForm.roleShares).filter(
                    (entry): entry is UserRole => ROLE_OPTIONS.includes(entry as UserRole),
                  );

                  await updateGalleryAccess({
                    slug: shareForm.slug,
                    roleShares,
                    userShares: parseCsv(shareForm.userShares),
                  });

                  const fresh = await getGallery(shareForm.slug);
                  setShareForm((prev) => ({
                    ...prev,
                    roleShares: fresh.gallery.access.roleShares.join(","),
                    userShares: fresh.gallery.access.userShares.join(","),
                  }));
                }, "Gallery access updated.");
              }}
            >
              Save Gallery Access
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/15 bg-white/5 p-3">
          <h4 className="font-semibold">Temporary Links</h4>
          <p className="mt-1 text-xs text-white/70">
            Selected media for quick link: {selectedMediaIds.length}
            {selectedPreview.length > 0 ? ` (${selectedPreview.join(", ")}${selectedMediaIds.length > selectedPreview.length ? "..." : ""})` : ""}
          </p>
          <div className="mt-2 grid gap-2">
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="temporary slug"
              value={viewForm.slug}
              onChange={(event) => setViewForm((prev) => ({ ...prev, slug: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="temporary title"
              value={viewForm.title}
              onChange={(event) => setViewForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              placeholder="optional gallery slug"
              value={viewForm.gallerySlug}
              onChange={(event) => setViewForm((prev) => ({ ...prev, gallerySlug: event.target.value }))}
            />
            <select
              className="rounded-lg bg-black/20 px-2 py-1"
              value={viewForm.visibility}
              onChange={(event) => setViewForm((prev) => ({ ...prev, visibility: event.target.value as "public" | "private" }))}
            >
              <option value="public">public</option>
              <option value="private">private</option>
            </select>
            <input
              className="rounded-lg bg-black/20 px-2 py-1"
              type="number"
              min={1}
              max={720}
              value={viewForm.expiresInHours}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setViewForm((prev) => ({
                  ...prev,
                  expiresInHours: Number.isFinite(parsed) ? Math.max(1, Math.min(720, parsed)) : 24,
                }));
              }}
            />
            <button
              className="rounded-lg bg-white/20 px-3 py-2 text-left hover:bg-white/30 disabled:opacity-40"
              disabled={busy}
              onClick={() => {
                runAction(async () => {
                  await createTemporaryView({
                    slug: viewForm.slug.trim(),
                    title: viewForm.title.trim(),
                    visibility: viewForm.visibility,
                    expiresInHours: viewForm.expiresInHours,
                    gallerySlug: viewForm.gallerySlug.trim() || undefined,
                    mediaIds: viewForm.gallerySlug.trim() ? undefined : selectedMediaIds,
                  });
                }, "Temporary view created.");
              }}
            >
              Create Temporary View
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg bg-black/20 px-2 py-1"
              placeholder="slug to revoke"
              value={revokeSlug}
              onChange={(event) => setRevokeSlug(event.target.value)}
            />
            <button
              className="rounded-lg bg-coral/50 px-3 py-1 hover:bg-coral/70 disabled:opacity-40"
              disabled={busy || !revokeSlug.trim()}
              onClick={() => {
                runAction(async () => {
                  await revokeTemporaryView(revokeSlug.trim());
                  setRevokeSlug("");
                }, "Temporary view revoked.");
              }}
            >
              Revoke
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
