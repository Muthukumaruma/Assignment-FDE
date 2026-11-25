import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { fakeDeps } from './fakes.js';

describe('proxy shared secret', () => {
  const app = createApp(fakeDeps(), { proxySecret: 's3cret-value-1234' });

  it('rejects API requests that did not come through the proxy', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(403);
    expect((await request(app).get('/api/auth/me').set('x-proxy-auth', 'wrong')).status).toBe(403);
  });

  it('lets proxied requests through to normal handling', async () => {
    expect((await request(app).get('/api/auth/me').set('x-proxy-auth', 's3cret-value-1234')).status).toBe(401);
  });

  it('keeps the health check open for the hosting platform', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('is off when no secret is configured (local dev, docker compose)', async () => {
    expect((await request(createApp(fakeDeps())).get('/api/auth/me')).status).toBe(401);
  });
});
