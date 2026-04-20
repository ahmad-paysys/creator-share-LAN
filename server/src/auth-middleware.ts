import type { NextFunction, Request, Response } from "express";
import { AuthService } from "./auth-service";

function extractToken(req: Request, cookieName: string): string | null {
  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  const cookieToken = req.cookies?.[cookieName];
  if (typeof cookieToken === "string" && cookieToken.trim().length > 0) {
    return cookieToken;
  }

  return null;
}

export function authContextMiddleware(authService: AuthService, cookieName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractToken(req, cookieName);
    if (!token) {
      req.auth = {
        sessionToken: null,
        user: null,
      };
      next();
      return;
    }

    const session = authService.getSession(token);
    req.auth = {
      sessionToken: token,
      user: session?.user ?? null,
    };

    next();
  };
}
