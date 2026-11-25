import bcrypt from 'bcryptjs';
import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { User } from '../models/User.js';
import type { GoogleVerifier } from '../types.js';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from './jwt.js';
import { currentUser, requireAuth } from './middleware.js';

const RegisterBody = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name: z.string().min(1).max(100),
});
const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });
const GoogleBody = z.object({ credential: z.string().min(1) });

type UserLike = { _id: unknown; email: string; name: string; role: string; avatarUrl?: string | null };
const publicUser = (u: UserLike) => ({
  id: String(u._id),
  email: u.email,
  name: u.name,
  role: u.role,
  avatarUrl: u.avatarUrl ?? undefined,
});

const isAdminEmail = (email: string) => !!env.ADMIN_EMAIL && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase();

/**
 * ADMIN_EMAIL bootstraps the first admin, but ONLY through a provider-verified email (Google).
 * Password sign-ups have no email verification, so trusting them would let anyone who registers
 * ADMIN_EMAIL first become admin. Without Google, use `npm run make-admin <email>` on the server.
 */

function startSession(res: Response, userId: string) {
  res.cookie(SESSION_COOKIE, signSession(userId), sessionCookieOptions);
}

export function authRouter(google: GoogleVerifier): Router {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.NODE_ENV === 'test' ? 1000 : 20 });

  router.post('/register', limiter, async (req, res) => {
    const body = RegisterBody.parse(req.body);
    const email = body.email.toLowerCase();
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');
    const user = await User.create({
      email,
      name: body.name,
      passwordHash: await bcrypt.hash(body.password, 10),
      role: 'user',
    });
    startSession(res, String(user._id));
    res.status(201).json(publicUser(user));
  });

  router.post('/login', limiter, async (req, res) => {
    const body = LoginBody.parse(req.body);
    const user = await User.findOne({ email: body.email.toLowerCase() });
    // Same message for "no such user" and "wrong password" so emails can't be enumerated.
    if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    startSession(res, String(user._id));
    res.json(publicUser(user));
  });

  router.post('/google', limiter, async (req, res) => {
    const { credential } = GoogleBody.parse(req.body);
    const profile = await google.verify(credential);
    if (!profile.emailVerified) throw new HttpError(401, 'Google account email is not verified');
    const email = profile.email.toLowerCase();

    let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email }] });
    if (user?.googleId && user.googleId !== profile.sub) {
      throw new HttpError(401, 'This email is linked to a different Google account');
    }
    if (!user) {
      user = await User.create({
        email,
        name: profile.name,
        googleId: profile.sub,
        avatarUrl: profile.picture,
        role: isAdminEmail(email) ? 'admin' : 'user',
      });
    } else if (!user.googleId) {
      // Linking Google to an existing password account. We never verified that the password
      // registrant owned this email, so their password is dropped: only the verified owner
      // (via Google) keeps access. This blocks "pre-hijacking" of accounts.
      user.googleId = profile.sub;
      user.passwordHash = undefined;
      user.avatarUrl ??= profile.picture;
    }
    if (isAdminEmail(email)) user.role = 'admin';
    if (user.isModified()) await user.save();
    startSession(res, String(user._id));
    res.json(publicUser(user));
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await User.findById(currentUser(req).id).lean();
    if (!user) throw new HttpError(401, 'Not signed in');
    res.json(publicUser(user));
  });

  return router;
}
