import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.js';
import { User } from '../models/User.js';
import { SESSION_COOKIE, verifySession } from './jwt.js';

export type Role = 'user' | 'admin';
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * The token only proves identity. The role is read from the database on every request,
 * so a demotion takes effect immediately instead of when the 7-day token expires.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = verifySession(req.cookies?.[SESSION_COOKIE]);
    const user = userId ? await User.findById(userId).lean() : null;
    if (!user) throw new HttpError(401, 'Not signed in');
    req.user = { id: String(user._id), email: user.email, name: user.name, role: user.role as Role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new HttpError(401, 'Not signed in'));
    if (req.user.role !== role) return next(new HttpError(403, 'Forbidden'));
    next();
  };
}

/** Narrowing helper for handlers mounted behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Not signed in');
  return req.user;
}
