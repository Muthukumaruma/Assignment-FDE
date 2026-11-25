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
};

const server = createApp(deps).listen(env.PORT, () => {
  logger.info({ port: env.PORT, db: env.MONGODB_DB, chatModel: env.OPENAI_CHAT_MODEL }, 'CareerLens API listening');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
