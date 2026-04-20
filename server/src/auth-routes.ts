import type { Express, Request, Response } from "express";
import { AuthService } from "./auth-service";

function sanitizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requirePrivilegedUser(req: Request, res: Response): boolean {
  const role = req.auth?.user?.role;
  if (role === "owner" || role === "admin") {
    return true;
  }

  res.status(403).json({ error: "Forbidden" });
  return false;
}

export function registerAuthRoutes(app: Express, deps: { authService: AuthService; cookieName: string }): void {
  app.post("/api/auth/login", async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    const result = await deps.authService.login({
      username,
      password,
      createdIp: req.ip || null,
      userAgent: req.header("user-agent") || null,
    });

    if (!result) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    res.cookie(deps.cookieName, result.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: result.expiresInMs,
      secure: false,
    });

    res.json({
      user: result.user,
      expiresAt: result.expiresAt,
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const token = req.auth?.sessionToken;
    if (token) {
      deps.authService.logout(token);
    }

    res.clearCookie(deps.cookieName);
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
