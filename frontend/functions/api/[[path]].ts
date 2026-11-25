/**
 * Cloudflare Pages Function: forwards /api/* to the backend (Render).
 *
 * Why a proxy instead of calling the API domain directly: the browser then talks to ONE origin,
 * so the httpOnly session cookie stays first-party (no third-party-cookie blocking, no CORS),
 * and Server-Sent Events stream straight through (the response body is passed on untouched).
 *
 * Configure API_ORIGIN (e.g. https://careerlens-api.onrender.com) in the Pages project settings.
 */
interface Env {
  API_ORIGIN: string;
}

interface Context {
  request: Request;
  env: Env;
}

export async function onRequest({ request, env }: Context): Promise<Response> {
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.API_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  try {
    return await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
      // Required by the fetch spec when streaming a request body.
      ...(hasBody ? { duplex: 'half' } : {}),
    } as RequestInit);
  } catch {
    // Render's free tier sleeps when idle; the first request after a nap can fail or be slow.
    return Response.json({ error: 'The API is starting up or unreachable. Try again in a minute.' }, { status: 502 });
  }
}
