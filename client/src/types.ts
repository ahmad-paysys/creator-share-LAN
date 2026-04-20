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
