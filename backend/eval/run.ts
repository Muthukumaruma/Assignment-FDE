/**
 * Offline quality check against the sample data, using the REAL model + Atlas index.
 *   npm run eval
 * Metrics:
 *  - citation hit-rate: did the answer cite every expected document label?
 *  - keyword recall: fraction of expected facts mentioned in the answer.
 * Cheap and deterministic enough to run before changing prompts, chunking or models.
 */
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import request from 'supertest';
import { createAnalysisHook } from '../src/analysis/service.js';
import { createApp } from '../src/app.js';
import { createGoogleVerifier } from '../src/auth/google.js';
import { env } from '../src/config/env.js';
import { connectDb } from '../src/db/connect.js';
import { ensureVectorIndex } from '../src/db/vectorIndex.js';
import { createOpenAiClient } from '../src/llm/client.js';
import { createAtlasRetriever } from '../src/rag/retriever.js';
import { DocumentModel } from '../src/models/Document.js';
import { Chunk } from '../src/models/Chunk.js';
import { User } from '../src/models/User.js';

interface Case {
  question: string;
  expectLabels: string[];
  expectKeywords: string[];
}

const cases: Case[] = JSON.parse(await readFile(new URL('./golden.json', import.meta.url), 'utf8'));
await connectDb(env.MONGODB_URI, env.MONGODB_DB);
await ensureVectorIndex();
const llm = createOpenAiClient({ apiKey: env.OPENAI_API_KEY, chatModel: env.OPENAI_CHAT_MODEL, embedModel: env.OPENAI_EMBED_MODEL });
const app = createApp({ llm, retriever: createAtlasRetriever(), google: createGoogleVerifier(''), onIngested: createAnalysisHook(llm) });

// Fresh eval user each run.
const email = 'eval-bot@careerlens.local';
const old = await User.findOne({ email });
if (old) {
  await Chunk.deleteMany({ userId: old._id });
  await DocumentModel.deleteMany({ userId: old._id });
  await old.deleteOne();
}
const agent = request.agent(app);
await agent.post('/api/auth/register').send({ email, password: 'eval-password-123', name: 'Eval' });
await agent.post('/api/documents/sample');

let hits = 0;
let recallSum = 0;
const rows: string[] = [];
for (const c of cases) {
  const res = await agent.post('/api/chat').send({ messages: [{ role: 'user', content: c.question }] }).buffer(true);
  const sourcesEvent = res.text.split('\n\n').find((b) => b.startsWith('event: sources'));
  const data = sourcesEvent ? JSON.parse(sourcesEvent.split('data: ')[1]) : { text: '', sources: [] };
  const cited = new Set<string>(data.sources.map((s: { label: string }) => s.label));
  const hit = c.expectLabels.every((l) => cited.has(l));
  const found = c.expectKeywords.filter((k) => data.text.toLowerCase().includes(k.toLowerCase()));
  const recall = c.expectKeywords.length ? found.length / c.expectKeywords.length : 1;
  hits += hit ? 1 : 0;
  recallSum += recall;
  rows.push(`${hit ? 'PASS' : 'MISS'}  recall ${(recall * 100).toFixed(0).padStart(3)}%  ${c.question}`);
}

const hitRate = hits / cases.length;
console.log('\n' + rows.join('\n'));
console.log(`\nCitation hit-rate: ${(hitRate * 100).toFixed(0)}%   Keyword recall: ${((recallSum / cases.length) * 100).toFixed(0)}%`);
await mongoose.disconnect();
process.exit(hitRate >= 0.8 ? 0 : 1);
