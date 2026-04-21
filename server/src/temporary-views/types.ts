import type { SafeUser } from "../auth/types";

export type TemporaryViewVisibility = "public" | "private";
export type TemporaryViewSourceType = "selection" | "gallery";

export interface TemporaryViewRecord {
  id: string;
  slug: string;
  title: string;
  visibility: TemporaryViewVisibility;
  sourceType: TemporaryViewSourceType;
  sourceGalleryId: string | null;
  createdBy: string | null;
  expiresAt: string;
  maxUses: number | null;
  usesCount: number;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemporaryViewItemRecord {
  id: string;
  shareViewId: string;
  mediaId: string;
  orderIndex: number;
  createdAt: string;
}

export function canManageTemporaryView(user: SafeUser, view: TemporaryViewRecord): boolean {
  if (user.role === "owner" || user.role === "admin") {
    return true;
  }

  return user.role === "editor" && view.createdBy === user.id;
}


