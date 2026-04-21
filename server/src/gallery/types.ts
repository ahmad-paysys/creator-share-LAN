import type { SafeUser, UserRole } from "../auth/types";

export type GalleryVisibility = "public" | "private";

export interface GalleryRecord {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  visibility: GalleryVisibility;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface GalleryItemRecord {
  id: string;
  galleryId: string;
  mediaId: string;
  orderIndex: number;
  addedBy: string | null;
  addedAt: string;
}

export interface GalleryAccessGrant {
  subjectType: "role" | "user";
  subjectValue: string;
  permission: "view";
}

export interface GalleryAccessSnapshot {
  roleShares: UserRole[];
  userShares: string[];
}

export interface GalleryListItem {
  slug: string;
  title: string;
  description: string | null;
  visibility: GalleryVisibility;
  itemCount: number;
  updatedAt: string;
}

export function canManageGallery(user: SafeUser, gallery: GalleryRecord): boolean {
  if (user.role === "owner" || user.role === "admin") {
    return true;
  }

  return user.role === "editor" && gallery.createdBy === user.id;
}


