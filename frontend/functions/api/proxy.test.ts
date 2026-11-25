// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { onRequest } from './[[path]]';

function ctx(url: string, init: RequestInit = {}, headers: Record<string, string> = {}) {
  const request = new Request(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  return { request, env: { API_ORIGIN: 'https://careerlens-api.onrender.com' } };
}

describe('Pages Function /api proxy', () => {
  it('forwards method, path, query, body and cookies to the API origin', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{"ok":true}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await onRequest(
      ctx('https://careerlens.pages.dev/api/documents?x=1', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } }, { cookie: 'cl_session=abc', 'cf-connecting-ip': '1.2.3.4' }) as never,
    );
    const [target, init] = fetchMock.mock.calls[0];
    expect(String(target)).toBe('https://careerlens-api.onrender.com/api/documents?x=1');
    expect(init?.method).toBe('POST');
    const h = new Headers(init?.headers);
    expect(h.get('cookie')).toBe('cl_session=abc');
    expect(h.get('x-forwarded-for')).toBe('1.2.3.4');
    expect(h.get('x-forwarded-host')).toBe('careerlens.pages.dev');
    vi.unstubAllGlobals();
  });

  it('passes the response through unchanged, including Set-Cookie and streaming bodies', async () => {
    const upstream = new Response('event: done\n\n', { status: 200, headers: { 'set-cookie': 'cl_session=new; HttpOnly', 'content-type': 'text/event-stream' } });
    vi.stubGlobal('fetch', vi.fn(async () => upstream));
    const res = await onRequest(ctx('https://careerlens.pages.dev/api/chat', { method: 'POST', body: '{}' }) as never);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('cl_session=new');
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(await res.text()).toBe('event: done\n\n');
    vi.unstubAllGlobals();
  });

  it('returns 502 with a JSON error when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connect ECONNREFUSED'); }));
    const res = await onRequest(ctx('https://careerlens.pages.dev/api/health') as never);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'The API is starting up or unreachable. Try again in a minute.' });
    vi.unstubAllGlobals();
  });
});

describe('proxy authentication to the API', () => {
  it('adds the shared secret and overrides any client-supplied copy or forwarded-for header', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const request = new Request('https://careerlens.pages.dev/api/auth/me', {
      headers: { 'x-proxy-auth': 'forged', 'x-forwarded-for': '6.6.6.6', 'cf-connecting-ip': '1.2.3.4' },
    });
    await onRequest({ request, env: { API_ORIGIN: 'https://api.example', PROXY_SECRET: 'real-secret' } } as never);
    const h = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(h.get('x-proxy-auth')).toBe('real-secret');
    expect(h.get('x-forwarded-for')).toBe('1.2.3.4');
    vi.unstubAllGlobals();
  });
});
