import mongoose from 'mongoose';
import { createAnalysisHook } from './analysis/service.js';
import { createApp } from './app.js';
import { createGoogleVerifier } from './auth/google.js';
import { env } from './config/env.js';
import { connectDb } from './db/connect.js';
import { ensureVectorIndex } from './db/vectorIndex.js';
import { logger } from './lib/logger.js';
import { createOpenAiClient } from './llm/client.js';
import { createAtlasRetriever } from './rag/retriever.js';
import { createR2FileStore } from './storage/r2.js';
import type { AppDeps } from './types.js';

await connectDb(env.MONGODB_URI, env.MONGODB_DB);
await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));
await ensureVectorIndex();

const llm = createOpenAiClient({ apiKey: env.OPENAI_API_KEY, chatModel: env.OPENAI_CHAT_MODEL, embedModel: env.OPENAI_EMBED_MODEL });
const deps: AppDeps = {
  llm,
  retriever: createAtlasRetriever(),
  google: createGoogleVerifier(env.GOOGLE_CLIENT_ID),
  onIngested: createAnalysisHook(llm),
  files:
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
      ? createR2FileStore({
          accountId: env.R2_ACCOUNT_ID,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          bucket: env.R2_BUCKET,
        })
      : undefined,
};
logger.info({ r2: !!deps.files }, deps.files ? 'original files stored in Cloudflare R2' : 'R2 not configured: original files are not kept');

const server = createApp(deps).listen(env.PORT, () => {
  logger.info({ port: env.PORT, db: env.MONGODB_DB, chatModel: env.OPENAI_CHAT_MODEL }, 'CareerLens API listening');
});

server.on('error', (err) => {
  logger.fatal({ err }, 'server failed to start (is the port already in use?)');
  process.exit(1);
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
