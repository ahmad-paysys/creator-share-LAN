export type MediaKind = "image" | "video";

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
  type: MediaKind;
  originalSize: number;
  thumbnailUrl: string;
  createdAt: string;
}

export interface AppConfig {
  apiBaseUrl: string;
  maxThumbnailResolution: string;
  port: number;
  nodeEnv: string;
  defaultImageResizeMb: number;
  defaultImageQuality: number;
  thumbnailSizePx: number;
  videoThumbnailQuality: number;
  videoFrameTimestamp: string;
  mediaRootPath: string;
  includeFolders: string[];
  excludeFolders: string[];
  recursiveScan: boolean;
  maxConcurrentResizeJobs: number;
  thumbnailCacheDir: string;
  thumbsDir: string;
  resizedDir: string;
  exposeToLan: boolean;
  corsAllowedOrigins: string[];
  databasePath: string;
  authSessionTtlHours: number;
  authCookieName: string;
  bootstrapOwnerUsername: string;
  bootstrapOwnerPassword: string;
  bootstrapOwnerDisplayName: string;
}
