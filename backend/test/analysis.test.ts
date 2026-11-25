import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createAnalysisHook } from '../src/analysis/service.js';
import { DocumentModel } from '../src/models/Document.js';
import type { AppDeps } from '../src/types.js';
import { fakeDeps, fakeLlm } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

const FIT = {
  score: 72,
  matchedSkills: ['React', 'Node.js'],
  missingSkills: ['Kubernetes'],
  experienceAlignment: 'Strong backend overlap.',
  summary: 'Good fit with one infra gap.',
  interviewTopics: ['System design'],
  scorecard: {
    atsCompatibility: { score: 70, note: 'n' },
    keywordMatch: { score: 60, note: 'n' },
    technicalSkills: { score: 75, note: 'n' },
    experienceRelevance: { score: 72, note: 'n' },
    leadershipArchitecture: { score: 50, note: 'n' },
  },
};
const RESUME = 'Jane\nSKILLS\nReact, Node.js';
const JOB = 'Dev — Acme\nRequirements\nReact, Kubernetes';

function appWithAnalysis(structured: unknown = FIT) {
  const llm = fakeLlm({ structured });
  const deps: AppDeps = fakeDeps({ llm });
  deps.onIngested = createAnalysisHook(deps.llm);
  return { app: createApp(deps), llm };
}

describe('fit analysis', () => {
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(clearDb);

  it('adding a job when a resume exists stores a validated analysis on the job', async () => {
    const { app } = appWithAnalysis();
    const { agent } = await registerAndLogin(app, 'a@x.com');
    await agent.post('/api/documents').send({ kind: 'resume', text: RESUME });
    const job = await agent.post('/api/documents').send({ kind: 'job', text: JOB });
    const saved = await DocumentModel.findById(job.body.id).lean();
    expect(saved?.analysis).toMatchObject({ score: 72, missingSkills: ['Kubernetes'] });
    expect(saved?.analysisStale).toBe(false);
  });

  it('replacing the resume re-analyses every job', async () => {
    const { app, llm } = appWithAnalysis();
    const { agent } = await registerAndLogin(app, 'b@x.com');
    await agent.post('/api/documents').send({ kind: 'resume', text: RESUME });
    await agent.post('/api/documents').send({ kind: 'job', text: JOB });
    await agent.post('/api/documents').send({ kind: 'job', text: JOB });
    const before = llm.calls.filter((c) => c.op === 'analyze').length;
    await agent.post('/api/documents').send({ kind: 'resume', text: RESUME });
    expect(llm.calls.filter((c) => c.op === 'analyze').length - before).toBe(2);
  });

  it('POST /:id/analyze returns 409 without a resume and 400 for the resume itself', async () => {
    const { app } = appWithAnalysis();
    const { agent } = await registerAndLogin(app, 'c@x.com');
    const job = await agent.post('/api/documents').send({ kind: 'job', text: JOB });
    const noResume = await agent.post(`/api/documents/${job.body.id}/analyze`);
    expect(noResume.status).toBe(409);
    expect(noResume.body).toEqual({ error: 'Upload a resume first' });
    const resume = await agent.post('/api/documents').send({ kind: 'resume', text: RESUME });
    expect((await agent.post(`/api/documents/${resume.body.id}/analyze`)).status).toBe(400);
    const ok = await agent.post(`/api/documents/${job.body.id}/analyze`);
    expect(ok.status).toBe(200);
    expect(ok.body.score).toBe(72);
  });

  it('marks the analysis as failed-safe (job still saved) when the model returns invalid JSON', async () => {
    const { app } = appWithAnalysis({ score: 'high' });
    const { agent } = await registerAndLogin(app, 'd@x.com');
    await agent.post('/api/documents').send({ kind: 'resume', text: RESUME });
    const job = await agent.post('/api/documents').send({ kind: 'job', text: JOB });
    expect(job.status).toBe(201);
    expect((await DocumentModel.findById(job.body.id).lean())?.analysis).toBeUndefined();
  });
});
