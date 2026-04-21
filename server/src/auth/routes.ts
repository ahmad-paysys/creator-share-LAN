import type { Express } from "express";
import { AuditStore } from "../ops/audit-store";
import { AuthService } from "./service";
import { createCsrfToken } from "../csrf-middleware";
import { requirePrivilegedUser } from "../shared/auth-guards";
import { LoginThrottle } from "./throttle";

function sanitizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function registerAuthRoutes(app: Express, deps: {
  authService: AuthService;
  cookieName: string;
  csrfCookieName?: string;
  loginThrottle?: LoginThrottle;
  auditStore?: AuditStore;
}): void {
  app.post("/api/auth/login", async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    const throttleKey = `${req.ip ?? "unknown"}:${username.toLowerCase()}`;
    if (deps.loginThrottle) {
      const gate = deps.loginThrottle.check(throttleKey);
      if (!gate.allowed) {
        res.setHeader("Retry-After", String(gate.retryAfterSeconds));
        deps.auditStore?.insertEvent({
          actorType: "anonymous",
          action: "auth.login_throttled",
          targetType: "user",
          targetId: username || null,
          result: "error",
          requestIp: req.ip ?? null,
        });
        res.status(429).json({ error: "Too many login attempts. Try again later." });
        return;
      }
    }

    const result = await deps.authService.login({
      username,
      password,
      createdIp: req.ip || null,
      userAgent: req.header("user-agent") || null,
    });

    if (!result) {
      deps.loginThrottle?.recordFailure(throttleKey);
      deps.auditStore?.insertEvent({
        actorType: "anonymous",
        action: "auth.login",
        targetType: "user",
        targetId: username || null,
        result: "error",
        requestIp: req.ip ?? null,
      });
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    deps.loginThrottle?.recordSuccess(throttleKey);

    res.cookie(deps.cookieName, result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: result.expiresInMs,
      secure: false,
    });

    const csrfCookieName = deps.csrfCookieName ?? "creator_csrf";
    const csrfToken = createCsrfToken();
    res.cookie(csrfCookieName, csrfToken, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: result.expiresInMs,
      secure: false,
    });

    res.json({
      user: result.user,
      expiresAt: result.expiresAt,
      csrfToken,
    });

    deps.auditStore?.insertEvent({
      actorType: "user",
      actorUserId: result.user.id,
      action: "auth.login",
      targetType: "session",
      targetId: result.user.id,
      result: "ok",
      requestIp: req.ip ?? null,
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = req.auth?.sessionToken;
    const userId = req.auth?.user?.id ?? null;
    if (token) {
      deps.authService.logout(token);
    }

    deps.auditStore?.insertEvent({
      actorType: userId ? "user" : "anonymous",
      actorUserId: userId,
      action: "auth.logout",
      targetType: "session",
      targetId: userId,
      result: "ok",
      requestIp: req.ip ?? null,
    });

    res.clearCookie(deps.cookieName);
    res.clearCookie(deps.csrfCookieName ?? "creator_csrf");
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.auth?.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    res.json({ user: req.auth.user });
  });

  app.post("/api/admin/users", async (req, res) => {
    if (!requirePrivilegedUser(req, res)) {
      return;
    }

    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const role = typeof req.body?.role === "string" ? req.body.role : "viewer";
    const displayName = sanitizeDisplayName(req.body?.displayName);

    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    try {
      const user = await deps.authService.createUser({ username, password, role, displayName });
      deps.auditStore?.insertEvent({
        actorType: "user",
        actorUserId: req.auth?.user?.id ?? null,
        action: "admin.user.create",
        targetType: "user",
        targetId: user.id,
        result: "ok",
        meta: { role: user.role, username: user.username },
        requestIp: req.ip ?? null,
      });
      res.status(201).json({ user });
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed: users\.username/.test(error.message)) {
        res.status(409).json({ error: "Username already exists" });
        return;
      }

      res.status(400).json({ error: error instanceof Error ? error.message : "Could not create user" });
    }
  });

  app.get("/api/admin/users", (req, res) => {
    if (!requirePrivilegedUser(req, res)) {
      return;
    }

    res.json({ users: deps.authService.listUsers() });
  });

  app.patch("/api/admin/users/:userId", async (req, res) => {
    if (!requirePrivilegedUser(req, res)) {
      return;
    }

    const userId = String(req.params.userId);
    const role = typeof req.body?.role === "string" ? req.body.role : "";
    if (!role) {
      res.status(400).json({ error: "role is required" });
      return;
    }

    try {
      const updated = await deps.authService.updateUserRole({
        actorUserId: req.auth!.user!.id,
        targetUserId: userId,
        role,
      });

      if (!updated) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      deps.auditStore?.insertEvent({
        actorType: "user",
        actorUserId: req.auth?.user?.id ?? null,
        action: "admin.user.role_update",
        targetType: "user",
        targetId: updated.id,
        result: "ok",
        meta: { role: updated.role },
        requestIp: req.ip ?? null,
      });

      res.json({ user: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update user role";
      if (message === "Forbidden") {
        res.status(403).json({ error: message });
        return;
      }

      res.status(400).json({ error: message });
    }
  });
}


