import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { errorHandler } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { authRouter } from './auth/routes.js';
import { chatRouter } from './routes/chat.js';
import { documentsRouter } from './routes/documents.js';
import { healthRouter } from './routes/health.js';
import type { AppDeps } from './types.js';

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

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
  app.use('/api/auth', authRouter(deps.google));
  app.use('/api/documents', documentsRouter(deps));
  app.use('/api/chat', chatRouter(deps));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}
