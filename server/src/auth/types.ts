export type UserRole = "owner" | "admin" | "editor" | "viewer";

export interface StoredUser {
  id: string;
  username: string;
  displayName: string | null;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  createdIp: string | null;
  userAgent: string | null;
}

export interface SafeUser {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
}

export interface AuthenticatedSession {
  user: SafeUser;
  sessionId: string;
  expiresAt: string;
}

export function toSafeUser(user: StoredUser): SafeUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}


