export interface FolderNode {
  id: string;
  name: string;
  path: string;
  children: FolderNode[];
  itemCount: number;
  hasImages: boolean;
  hasVideos: boolean;
}

export interface MediaItem {
  id: string;
  folderId: string;
  relativePath: string;
  absolutePath: string;
  name: string;
  type: "image" | "video";
  originalSize: number;
  thumbnailUrl: string;
  createdAt: string;
}

export interface DownloadRequestItem {
  id: string;
  resizeMb: number | null;
}

export interface DownloadResponse {
  downloads: Array<{
    id: string;
    url: string;
    filename: string;
  }>;
}

export interface SyncStatus {
  state: "idle" | "scanning" | "updated";
  revision: number;
  mediaCount: number;
  newMediaCount: number;
  lastScanAt: number;
  queued: number;
  active: number;
  pendingThumbnails: number;
  indexDirty: boolean;
}

export type UserRole = "owner" | "admin" | "editor" | "viewer";
export type ThemeProfile = "dark" | "light" | "solar";

export interface SafeUser {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
}

export interface VisibilitySettings {
  folderViewPublic: boolean;
  libraryViewPublic: boolean;
  uiThemeDefault: ThemeProfile;
}

export interface GalleryListItem {
  slug: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  updatedAt: string;
  itemCount: number;
}

export interface GalleryDetail {
  slug: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  access: {
    roleShares: UserRole[];
    userShares: string[];
  };
  items: MediaItem[];
  missingMediaIds: string[];
  updatedAt: string;
}

export interface TemporaryViewDetail {
  slug: string;
  title: string;
  visibility: "public" | "private";
  sourceType: "selection" | "gallery";
  sourceGalleryId: string | null;
  expiresAt: string;
  maxUses: number | null;
  usesCount: number;
  revokedAt: string | null;
  items: MediaItem[];
  missingMediaIds: string[];
  updatedAt: string;
}
