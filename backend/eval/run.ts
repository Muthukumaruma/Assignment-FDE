/**
 * Offline quality check against the sample data, using the REAL model + Atlas index.
 *   npm run eval
 * Metrics:
 *  - grounded answers: share of answers with at least one valid citation (the gate, ≥ 90%).
 *  - label recall: share of the expected documents that were cited.
 *  - keyword recall: share of expected facts mentioned in the answer.
 * LLM output varies run to run, so compare a few runs before trusting a change.
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

const pct = (x: number) => `${(x * 100).toFixed(0).padStart(3)}%`;
let groundedCount = 0;
let groundable = 0;
let labelRecallSum = 0;
let keywordRecallSum = 0;
const rows: string[] = [];
for (const c of cases) {
  const res = await agent.post('/api/chat').send({ messages: [{ role: 'user', content: c.question }] }).buffer(true);
  const sourcesEvent = res.text.split('\n\n').find((b) => b.startsWith('event: sources'));
  const data = sourcesEvent ? JSON.parse(sourcesEvent.split('data: ')[1]) : { text: '', sources: [] };
  const cited = new Set<string>(data.sources.map((s: { label: string }) => s.label));

  // Grounded: at least one valid citation. Cases with no expected labels (e.g. "Job #7?") are exempt.
  const shouldCite = c.expectLabels.length > 0;
  const grounded = cited.size > 0;
  if (shouldCite) {
    groundable += 1;
    groundedCount += grounded ? 1 : 0;
  }
  const labelRecall = shouldCite ? c.expectLabels.filter((l) => cited.has(l)).length / c.expectLabels.length : 1;
  const found = c.expectKeywords.filter((k) => data.text.toLowerCase().includes(k.toLowerCase()));
  const keywordRecall = c.expectKeywords.length ? found.length / c.expectKeywords.length : 1;
  labelRecallSum += labelRecall;
  keywordRecallSum += keywordRecall;

  const ok = (!shouldCite || grounded) && labelRecall === 1 && keywordRecall === 1;
  let row = `${ok ? 'PASS' : 'WARN'}  labels ${pct(labelRecall)}  keywords ${pct(keywordRecall)}  ${c.question}`;
  if (!ok) row += `\n      cited: [${[...cited].join(', ')}]  missing keywords: [${c.expectKeywords.filter((k) => !found.includes(k)).join(', ')}]`;
  rows.push(row);
}

const groundedRate = groundable ? groundedCount / groundable : 1;
console.log('\n' + rows.join('\n'));
console.log(
  `\nGrounded answers: ${pct(groundedRate)}   Label recall: ${pct(labelRecallSum / cases.length)}   Keyword recall: ${pct(keywordRecallSum / cases.length)}`,
);
await mongoose.disconnect();
// Gate on the property users rely on most: every factual answer carries at least one valid citation.
process.exit(groundedRate >= 0.9 ? 0 : 1);
