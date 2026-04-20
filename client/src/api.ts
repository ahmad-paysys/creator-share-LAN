import type { DownloadRequestItem, DownloadResponse, FolderNode, MediaItem, SyncStatus } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
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
