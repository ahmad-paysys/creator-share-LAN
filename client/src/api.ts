import type {
  DownloadRequestItem,
  DownloadResponse,
  FolderNode,
  GalleryDetail,
  GalleryListItem,
  MediaItem,
  SafeUser,
  SyncStatus,
  ThemeProfile,
  TemporaryViewDetail,
  UserRole,
  VisibilitySettings,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const entries = document.cookie.split(";").map((entry) => entry.trim());
  const match = entries.find((entry) => entry.startsWith(`${name}=`));
  if (!match) {
    return null;
  }

  return decodeURIComponent(match.slice(name.length + 1));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers ?? {});
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = readCookie("creator_csrf");
    if (csrfToken) {
      headers.set("x-csrf-token", csrfToken);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function requestOrNull<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function fetchFolders(): Promise<FolderNode> {
  return request<FolderNode>("/api/folders");
}

export function fetchFolderMedia(folderId: string): Promise<MediaItem[]> {
  return request<MediaItem[]>(`/api/folders/${folderId}/media`);
}

export function fetchSyncStatus(): Promise<SyncStatus> {
  return request<SyncStatus>("/api/sync-status");
}

export function fetchPublicSettings(): Promise<{ uiThemeDefault: ThemeProfile }> {
  return request<{ uiThemeDefault: ThemeProfile }>("/api/settings");
}

export function createDownloadPlan(items: DownloadRequestItem[]): Promise<DownloadResponse> {
  return request<DownloadResponse>("/api/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ items }),
  });
}

export function absoluteUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function fetchCurrentUser(): Promise<SafeUser | null> {
  const response = await requestOrNull<{ user: SafeUser }>("/api/auth/me");
  return response?.user ?? null;
}

export function login(username: string, password: string): Promise<{ user: SafeUser; expiresAt: string }> {
  return request<{ user: SafeUser; expiresAt: string }>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export function fetchAdminSettings(): Promise<VisibilitySettings> {
  return request<VisibilitySettings>("/api/admin/settings");
}

export function updateAdminSettings(input: Partial<VisibilitySettings>): Promise<VisibilitySettings> {
  return request<VisibilitySettings>("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function listAdminUsers(): Promise<{ users: SafeUser[] }> {
  return request<{ users: SafeUser[] }>("/api/admin/users");
}

export function createAdminUser(input: {
  username: string;
  password: string;
  displayName?: string;
  role: UserRole;
}): Promise<{ user: SafeUser }> {
  return request<{ user: SafeUser }>("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateAdminUserRole(userId: string, role: UserRole): Promise<{ user: SafeUser }> {
  return request<{ user: SafeUser }>(`/api/admin/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export function listGalleries(): Promise<{ galleries: GalleryListItem[] }> {
  return request<{ galleries: GalleryListItem[] }>("/api/galleries");
}

export function getGallery(slug: string): Promise<{ gallery: GalleryDetail }> {
  return request<{ gallery: GalleryDetail }>(`/api/gallery/${encodeURIComponent(slug)}`);
}

export function createGallery(input: {
  slug: string;
  title: string;
  description?: string;
  visibility: "public" | "private";
}): Promise<{ gallery: GalleryDetail }> {
  return request<{ gallery: GalleryDetail }>("/api/galleries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateGalleryAccess(input: {
  slug: string;
  roleShares: UserRole[];
  userShares: string[];
}): Promise<{ gallery: GalleryDetail }> {
  return request<{ gallery: GalleryDetail }>(`/api/gallery/${encodeURIComponent(input.slug)}/access`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roleShares: input.roleShares,
      userShares: input.userShares,
    }),
  });
}

export function createTemporaryView(input: {
  slug: string;
  title: string;
  visibility: "public" | "private";
  expiresInHours?: number;
  mediaIds?: string[];
  gallerySlug?: string;
}): Promise<{ view: TemporaryViewDetail }> {
  return request<{ view: TemporaryViewDetail }>("/api/views", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function revokeTemporaryView(slug: string): Promise<{ view: TemporaryViewDetail }> {
  return request<{ view: TemporaryViewDetail }>(`/api/view/${encodeURIComponent(slug)}/revoke`, {
    method: "POST",
  });
}
