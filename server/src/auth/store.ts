import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { AuthenticatedSession, SafeUser, SessionRecord, StoredUser, UserRole } from "./types";
import { toSafeUser } from "./types";

function mapStoredUser(row: {
  id: string;
  username: string;
  display_name: string | null;
  password_hash: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  updated_at: string;
}): StoredUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    passwordHash: row.password_hash,
    role: row.role,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AuthStore {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  public countUsers(): number {
    const row = this.db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
    return row.count;
  }

  public createUser(input: {
    username: string;
    displayName: string | null;
    passwordHash: string;
    role: UserRole;
  }): StoredUser {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO users(id, username, display_name, password_hash, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(id, input.username, input.displayName, input.passwordHash, input.role, now, now);

    return this.getUserById(id)!;
  }

  public getUserByUsername(username: string): StoredUser | null {
    const row = this.db
      .prepare(
        `SELECT id, username, display_name, password_hash, role, is_active, created_at, updated_at
         FROM users WHERE username = ?`,
      )
      .get(username) as
      | {
          id: string;
          username: string;
          display_name: string | null;
          password_hash: string;
          role: UserRole;
          is_active: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return row ? mapStoredUser(row) : null;
  }

  public getUserById(userId: string): StoredUser | null {
    const row = this.db
      .prepare(
        `SELECT id, username, display_name, password_hash, role, is_active, created_at, updated_at
         FROM users WHERE id = ?`,
      )
      .get(userId) as
      | {
          id: string;
          username: string;
          display_name: string | null;
          password_hash: string;
          role: UserRole;
          is_active: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    return row ? mapStoredUser(row) : null;
  }

  public getUsersByUsernames(usernames: string[]): StoredUser[] {
    const normalized = Array.from(new Set(usernames.map((entry) => entry.trim()).filter(Boolean)));
    if (normalized.length === 0) {
      return [];
    }

    const placeholders = normalized.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `SELECT id, username, display_name, password_hash, role, is_active, created_at, updated_at
         FROM users WHERE username IN (${placeholders})`,
      )
      .all(...normalized) as Array<{
      id: string;
      username: string;
      display_name: string | null;
      password_hash: string;
      role: UserRole;
      is_active: number;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(mapStoredUser);
  }

  public listUsers(): SafeUser[] {
    const rows = this.db
      .prepare(
        `SELECT id, username, display_name, password_hash, role, is_active, created_at, updated_at
         FROM users
         WHERE is_active = 1
         ORDER BY created_at ASC`,
      )
      .all() as Array<{
      id: string;
      username: string;
      display_name: string | null;
      password_hash: string;
      role: UserRole;
      is_active: number;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => toSafeUser(mapStoredUser(row)));
  }

  public updateUserRole(userId: string, role: UserRole): SafeUser | null {
    const result = this.db
      .prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ? AND is_active = 1")
      .run(role, new Date().toISOString(), userId);

    if (result.changes === 0) {
      return null;
    }

    const updated = this.getUserById(userId);
    return updated ? toSafeUser(updated) : null;
  }

  public createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
    createdIp: string | null;
    userAgent: string | null;
  }): SessionRecord {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(
      `INSERT INTO sessions(id, user_id, token_hash, created_at, expires_at, last_seen_at, created_ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.userId, input.tokenHash, now, input.expiresAt, now, input.createdIp, input.userAgent);

    return {
      id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: now,
      expiresAt: input.expiresAt,
      lastSeenAt: now,
      createdIp: input.createdIp,
      userAgent: input.userAgent,
    };
  }

  public getAuthenticatedSessionByTokenHash(tokenHash: string, nowIso: string): AuthenticatedSession | null {
    const row = this.db
      .prepare(
        `SELECT
          s.id as session_id,
          s.expires_at as expires_at,
          u.id as user_id,
          u.username as username,
          u.display_name as display_name,
          u.role as role,
          u.is_active as is_active
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, nowIso) as
      | {
          session_id: string;
          expires_at: string;
          user_id: string;
          username: string;
          display_name: string | null;
          role: UserRole;
          is_active: number;
        }
      | undefined;

    if (!row || row.is_active !== 1) {
      return null;
    }

    return {
      sessionId: row.session_id,
      expiresAt: row.expires_at,
      user: {
        id: row.user_id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
      },
    };
  }

  public deleteSessionByTokenHash(tokenHash: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
  }

  public deleteExpiredSessions(nowIso: string): number {
    const result = this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso);
    return result.changes;
  }

  public touchSession(sessionId: string): void {
    this.db
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
      .run(new Date().toISOString(), sessionId);
  }

  public countActiveSessions(nowIso: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?")
      .get(nowIso) as { count: number };

    return Number(row.count);
  }

  public countSessionsExpiringBefore(cutoffIso: string, nowIso: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE expires_at > ? AND expires_at <= ?")
      .get(nowIso, cutoffIso) as { count: number };

    return Number(row.count);
  }
}


