import { randomUUID, timingSafeEqual } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { errorHandler } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { authRouter } from './auth/routes.js';
import { adminRouter, metricsRouter } from './routes/admin.js';
import { chatRouter } from './routes/chat.js';
import { documentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';
import type { AppDeps } from './types.js';

/** Constant-time comparison so the secret can't be guessed byte by byte from response timing. */
function sameSecret(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface AppOptions {
  /**
   * When set, every /api request except the health check must carry `x-proxy-auth: <secret>`.
   * Used when the API sits behind the Cloudflare Pages proxy: the API then only accepts traffic
   * through the proxy, so the client IP that the proxy forwards can be trusted for rate limiting.
   */
  proxySecret?: string;
  /** Per-user budget for LLM-costly document requests per 10 minutes (default 30; tests override). */
  costLimitPerWindow?: number;
}

export function createApp(deps: AppDeps, options: AppOptions = {}): Express {
  // Each option falls back to its own default, so passing one never silently drops another.
  const opts: AppOptions = { proxySecret: env.PROXY_SECRET || undefined, ...options };
  const app = express();
  app.disable('x-powered-by');
  // Correct client IPs (for rate limiting) depend on how many proxies sit in front of us.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  if (opts.proxySecret) {
    const secret = opts.proxySecret;
    app.use('/api', (req, res, next) => {
      if (sameSecret(req.get('x-proxy-auth'), secret)) return next();
      res.status(403).json({ error: 'Direct access is not allowed' });
    });
  }
  app.use('/api/auth', authRouter(deps.google));
  app.use('/api/documents', documentsRouter(deps, { costLimitPerWindow: opts.costLimitPerWindow }));
  app.use('/api/chat', chatRouter(deps));
  app.use('/api/admin', adminRouter());
  app.use('/api/metrics', metricsRouter());

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
