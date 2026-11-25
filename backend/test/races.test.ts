import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { analyzeJob } from '../src/analysis/service.js';
import { createApp } from '../src/app.js';
import { DocumentModel } from '../src/models/Document.js';
import type { LlmClient } from '../src/types.js';
import { fakeDeps, fakeLlm } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

const row = { score: 50, note: 'n' };
const FIT = {
  score: 50, matchedSkills: [], missingSkills: [], experienceAlignment: '', summary: '', interviewTopics: [],
  scorecard: { atsCompatibility: row, keywordMatch: row, technicalSkills: row, experienceRelevance: row, leadershipArchitecture: row },
};

describe('concurrency', () => {
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(clearDb);

  it('does not save a score computed against a resume that was replaced mid-analysis', async () => {
    const app = createApp(fakeDeps());
    const { agent, user } = await registerAndLogin(app, 'race@x.com');
    await agent.post('/api/documents').send({ kind: 'resume', text: 'Old\nSKILLS\nGo' });
    const job = await agent.post('/api/documents').send({ kind: 'job', text: 'Dev — Acme\nRequirements\nGo' });

    // While the model is "thinking", the user uploads a new resume.
    const llm: LlmClient = {
      ...fakeLlm(),
      async structured(_m, schema) {
        await agent.post('/api/documents').send({ kind: 'resume', text: 'New\nSKILLS\nRust' });
        return schema.parse(FIT);
      },
    };
    await analyzeJob(user.id, job.body.id, llm, { requestId: 't', userId: user.id });

    const saved = await DocumentModel.findById(job.body.id).lean();
    expect(saved?.analysis).toBeUndefined();
    expect(saved?.analysisStale).toBe(true);
  });

  it('gives concurrent job uploads distinct numbers', async () => {
    const app = createApp(fakeDeps());
    const { agent } = await registerAndLogin(app, 'para@x.com');
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) => agent.post('/api/documents').send({ kind: 'job', text: `Role ${n} — Co\nRequirements\nGo` })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.label)).size).toBe(4);
  });
});

describe('job cap under concurrency', () => {
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);

  it('never exceeds 10 jobs even when uploads race', async () => {
    const app = createApp(fakeDeps());
    const { agent, user } = await registerAndLogin(app, 'capr@x.com');
    await Promise.all(
      Array.from({ length: 14 }, (_, n) => agent.post('/api/documents').send({ kind: 'job', text: `Role ${n} — Co\nRequirements\nGo` })),
    );
    expect(await DocumentModel.countDocuments({ userId: user.id, kind: 'job' })).toBeLessThanOrEqual(10);
  });
});
