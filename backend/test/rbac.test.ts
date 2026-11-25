import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { requireAuth, requireRole } from '../src/auth/middleware.js';
import { errorHandler } from '../src/lib/errors.js';
import { fakeDeps } from './fakes.js';
import { registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

describe('requireRole', () => {
  const app = createApp(fakeDeps());
  const guarded = express()
    .use(cookieParser())
    .get('/admin-only', requireAuth, requireRole('admin'), (_req, res) => res.json({ ok: true }))
    .use(errorHandler);
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);

  it('returns 403 for a normal user and 200 for an admin', async () => {
    const { cookie: userCookie } = await registerAndLogin(app, 'u@x.com');
    const { cookie: adminCookie } = await registerAndLogin(app, 'admin@example.com');
    expect((await request(guarded).get('/admin-only').set('Cookie', userCookie)).status).toBe(403);
    expect((await request(guarded).get('/admin-only').set('Cookie', adminCookie)).status).toBe(200);
    expect((await request(guarded).get('/admin-only')).status).toBe(401);
  });
});
