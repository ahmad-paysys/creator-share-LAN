import type { Request, Response } from "express";
import type { SafeUser } from "../auth/types";

export function requirePrivilegedUser(req: Request, res: Response): SafeUser | null {
  const user = req.auth?.user;
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  if (user.role === "owner" || user.role === "admin") {
    return user;
  }

  res.status(403).json({ error: "Forbidden" });
  return null;
}

export function requireAdmin(req: Request, res: Response): SafeUser | null {
  return requirePrivilegedUser(req, res);
}
