import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => i.message) });
    return;
  }
  // multer and body-parser errors carry their own status codes
  const status = (err as { status?: number; code?: string }).status;
  if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large (max 5 MB)' });
    return;
  }
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: (err as Error).message });
    return;
  }
  logger.error({ err, requestId: req.id }, 'unhandled error');
  res.status(500).json({ error: 'Internal error' });
};
