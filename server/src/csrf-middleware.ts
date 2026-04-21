import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isProtectedMutation(req: Request): boolean {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
    return false;
  }

  const path = req.path;

  if (path === "/api/auth/login") {
    return false;
  }

  if (path === "/api/download") {
    return false;
  }

  if (path.startsWith("/api/admin/")) {
    return true;
  }

  if (path.startsWith("/api/gallery/")) {
    return true;
  }

  if (path.startsWith("/api/views") || path.startsWith("/api/view/")) {
    return true;
  }

  if (path === "/api/auth/logout") {
    return true;
  }

  return false;
}

function safeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function createCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

export function csrfProtectionMiddleware(csrfCookieName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth?.user || !isProtectedMutation(req)) {
      next();
      return;
    }

    const cookieToken = req.cookies?.[csrfCookieName];
    const headerToken = req.header("x-csrf-token");

    if (typeof cookieToken !== "string" || cookieToken.length === 0) {
      res.status(403).json({ error: "Invalid CSRF token" });
      return;
    }

    if (typeof headerToken !== "string" || headerToken.length === 0) {
      res.status(403).json({ error: "Invalid CSRF token" });
      return;
    }

    if (!safeEquals(cookieToken, headerToken)) {
      res.status(403).json({ error: "Invalid CSRF token" });
      return;
    }

    next();
  };
}
