import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'cl_session';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
}

/** Returns the user id, or null if the token is missing/invalid/expired. */
export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true, // not readable from JS → an XSS bug can't steal the session
  sameSite: 'lax', // blocks cross-site POSTs (CSRF) while allowing normal navigation
  secure: env.NODE_ENV === 'production',
  maxAge: SEVEN_DAYS_MS,
  path: '/',
};
