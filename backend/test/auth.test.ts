import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';
import { fakeDeps } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

const google = (p: Record<string, unknown>) =>
  JSON.stringify({ sub: 'g-1', email: 'g@x.com', name: 'G', emailVerified: true, ...p });

describe('auth', () => {
  const app = createApp(fakeDeps());
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(clearDb);

  it('registers, sets the session cookie, and /me returns the user without the password hash', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/register').send({ email: 'Me@X.com', password: 'password123', name: 'Me' });
    expect(res.status).toBe(201);
    expect(String(res.headers['set-cookie'])).toMatch(/cl_session=.*HttpOnly/i);
    expect(res.body.passwordHash).toBeUndefined();
    const me = await agent.get('/api/auth/me');
    expect(me.body).toMatchObject({ email: 'me@x.com', name: 'Me', role: 'user' });
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('does NOT grant admin to a password registration of ADMIN_EMAIL (email is unverified)', async () => {
    const { user } = await registerAndLogin(app, 'admin@example.com');
    expect(user.role).toBe('user');
  });

  it('grants admin to ADMIN_EMAIL only via Google with a verified email', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: google({ sub: 'g-admin', email: 'admin@example.com' }) });
    expect(res.body.role).toBe('admin');
  });

  it('rejects duplicate registration with 409 and short passwords with 400', async () => {
    await registerAndLogin(app, 'dup@x.com');
    const dup = await request(app).post('/api/auth/register').send({ email: 'dup@x.com', password: 'password123', name: 'D' });
    expect(dup.status).toBe(409);
    const short = await request(app).post('/api/auth/register').send({ email: 's@x.com', password: 'short', name: 'S' });
    expect(short.status).toBe(400);
  });

  it('login with the wrong password returns 401 with a generic message', async () => {
    await registerAndLogin(app, 'l@x.com');
    const res = await request(app).post('/api/auth/login').send({ email: 'l@x.com', password: 'wrong-pass' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
    const ok = await request(app).post('/api/auth/login').send({ email: 'l@x.com', password: 'password123' });
    expect(ok.status).toBe(200);
  });

  it('google sign-in creates a user with googleId', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: google({}) });
    expect(res.status).toBe(200);
    const u = await User.findOne({ email: 'g@x.com' });
    expect(u?.googleId).toBe('g-1');
  });

  it('google sign-in links to an existing password account and invalidates the unverified password', async () => {
    // Pre-hijack scenario: someone registered g@x.com with a password before the real owner used Google.
    const { user } = await registerAndLogin(app, 'g@x.com');
    const res = await request(app).post('/api/auth/google').send({ credential: google({}) });
    expect(res.body.id).toBe(user.id);
    expect(await User.countDocuments({ email: 'g@x.com' })).toBe(1);
    const pw = await request(app).post('/api/auth/login').send({ email: 'g@x.com', password: 'password123' });
    expect(pw.status).toBe(401);
  });

  it("kills a pre-hijacker's existing session when the real owner links Google (no inherited admin)", async () => {
    const { agent: attacker } = await registerAndLogin(app, 'admin@example.com');
    const owner = await request(app).post('/api/auth/google').send({ credential: google({ sub: 'g-adm', email: 'admin@example.com' }) });
    expect(owner.body.role).toBe('admin');
    expect((await attacker.get('/api/auth/me')).status).toBe(401);
  });

  it('refuses google sign-in when the account is already linked to a different Google id', async () => {
    await request(app).post('/api/auth/google').send({ credential: google({ sub: 'g-1' }) });
    const res = await request(app).post('/api/auth/google').send({ credential: google({ sub: 'g-OTHER' }) });
    expect(res.status).toBe(401);
  });

  it('google sign-in with an unverified email is rejected', async () => {
    const res = await request(app).post('/api/auth/google').send({ credential: google({ emailVerified: false }) });
    expect(res.status).toBe(401);
  });

  it('/me without a cookie is 401; logout clears the session', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const { agent } = await registerAndLogin(app, 'o@x.com');
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  it('role changes take effect without re-login (role is read from the DB, not trusted from the token)', async () => {
    const { agent, user } = await registerAndLogin(app, 'r@x.com');
    await User.updateOne({ _id: user.id }, { role: 'admin' });
    expect((await agent.get('/api/auth/me')).body.role).toBe('admin');
  });
});
