import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AuthStore } from "./auth-store";
import type { AuthenticatedSession, SafeUser, UserRole } from "./auth-types";
import { toSafeUser } from "./auth-types";

const scrypt = promisify(nodeScrypt);
const HASH_PREFIX = "scrypt";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${HASH_PREFIX}$${salt}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [prefix, salt, digest] = hash.split("$");
  if (prefix !== HASH_PREFIX || !salt || !digest) {
    return false;
  }

  const computed = (await scrypt(password, salt, 64)) as Buffer;
  const digestBuffer = Buffer.from(digest, "hex");
  if (computed.length !== digestBuffer.length) {
    return false;
  }

  return timingSafeEqual(computed, digestBuffer);
}

function assertValidPassword(password: string): void {
  if (password.length < 10) {
    throw new Error("Password must be at least 10 characters.");
  }
}

function assertValidUsername(username: string): void {
  if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) {
    throw new Error("Username must be 3-64 chars and use letters, numbers, dot, underscore, or dash.");
  }
}

function assertValidRole(role: string): asserts role is UserRole {
  if (!(["owner", "admin", "editor", "viewer"] as string[]).includes(role)) {
    throw new Error("Invalid role.");
  }
}

export class AuthService {
  private store: AuthStore;
  private sessionTtlHours: number;

  constructor(store: AuthStore, sessionTtlHours: number) {
    this.store = store;
    this.sessionTtlHours = Math.max(1, sessionTtlHours);
  }

  public async bootstrapOwnerIfNeeded(input: {
    username: string;
    password: string;
    displayName: string;
  }): Promise<SafeUser | null> {
    if (this.store.countUsers() > 0) {
      return null;
    }

    if (!input.username || !input.password) {
      return null;
    }

    return this.createUser({
      username: input.username,
      password: input.password,
      displayName: input.displayName,
      role: "owner",
    });
  }

  public async createUser(input: {
    username: string;
    password: string;
    displayName: string | null;
    role: string;
  }): Promise<SafeUser> {
    assertValidUsername(input.username);
    assertValidPassword(input.password);
    assertValidRole(input.role);

    const passwordHash = await hashPassword(input.password);
    const user = this.store.createUser({
      username: input.username,
      displayName: input.displayName,
      passwordHash,
      role: input.role,
    });

    return toSafeUser(user);
  }

  public async login(input: {
    username: string;
    password: string;
    createdIp: string | null;
    userAgent: string | null;
  }): Promise<{ user: SafeUser; sessionToken: string; expiresAt: string; expiresInMs: number } | null> {
    const user = this.store.getUserByUsername(input.username);
    if (!user || !user.isActive) {
      return null;
    }

    const matches = await verifyPassword(input.password, user.passwordHash);
    if (!matches) {
      return null;
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(sessionToken);
    const expiresAtDate = new Date(Date.now() + this.sessionTtlHours * 60 * 60 * 1000);
    const expiresAt = expiresAtDate.toISOString();

    this.store.createSession({
      userId: user.id,
      tokenHash,
      expiresAt,
      createdIp: input.createdIp,
      userAgent: input.userAgent,
    });

    return {
      user: toSafeUser(user),
      sessionToken,
      expiresAt,
      expiresInMs: expiresAtDate.getTime() - Date.now(),
    };
  }

  public getSession(token: string): AuthenticatedSession | null {
    const tokenHash = hashToken(token);
    const nowIso = new Date().toISOString();
    this.store.deleteExpiredSessions(nowIso);
    const session = this.store.getAuthenticatedSessionByTokenHash(tokenHash, nowIso);
    if (!session) {
      return null;
    }

    this.store.touchSession(session.sessionId);
    return session;
  }

  public logout(token: string): void {
    this.store.deleteSessionByTokenHash(hashToken(token));
  }
}
