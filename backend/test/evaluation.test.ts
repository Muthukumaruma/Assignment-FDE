import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAnalysisHook } from '../src/analysis/service.js';
import { createApp } from '../src/app.js';
import { DocumentModel } from '../src/models/Document.js';
import type { AppDeps } from '../src/types.js';
import { fakeDeps, fakeLlm } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

const row = (score: number) => ({ score, note: 'n' });
const FIT = {
  score: 70,
  matchedSkills: ['React'],
  missingSkills: ['Go'],
  experienceAlignment: 'ok',
  summary: 's',
  interviewTopics: ['t'],
  scorecard: {
    atsCompatibility: row(80),
    keywordMatch: row(60),
    technicalSkills: row(75),
    experienceRelevance: row(65),
    leadershipArchitecture: row(50),
  },
};

describe('resume evaluation', () => {
  const deps: AppDeps = fakeDeps({ llm: fakeLlm({ structured: FIT }) });
  deps.onIngested = createAnalysisHook(deps.llm);
  const app = createApp(deps);
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(clearDb);

  it('stores a 5-criterion scorecard on each analysed job', async () => {
    const { agent } = await registerAndLogin(app, 'a@x.com');
    await agent.post('/api/documents').send({ kind: 'resume', text: 'Jane\nSKILLS\nReact' });
    const job = await agent.post('/api/documents').send({ kind: 'job', text: 'Dev — Acme\nRequirements\nGo' });
    const saved = await DocumentModel.findById(job.body.id).lean();
    expect(saved?.analysis?.scorecard?.keywordMatch).toEqual({ score: 60, note: 'n' });
    const list = await agent.get('/api/documents');
    expect(list.body.find((d: { id: string }) => d.id === job.body.id).analysis.scorecard.atsCompatibility.score).toBe(80);
  });

  it('GET /:id/ats returns the rule-based checklist for the resume only', async () => {
    const { agent } = await registerAndLogin(app, 'b@x.com');
    const resume = await agent.post('/api/documents').send({ kind: 'resume', text: 'Jane jane@x.com\nSKILLS\nReact' });
    const res = await agent.get(`/api/documents/${resume.body.id}/ats`);
    expect(res.status).toBe(200);
    expect(res.body.checks.map((c: { id: string }) => c.id)).toEqual(['contact', 'sections', 'metrics', 'length', 'links']);
    const job = await agent.post('/api/documents').send({ kind: 'job', text: 'Dev — Acme\nRequirements\nGo' });
    expect((await agent.get(`/api/documents/${job.body.id}/ats`)).status).toBe(400);
  });

  it("another user's resume checklist is not found", async () => {
    const a = await registerAndLogin(app, 'owner@x.com');
    const b = await registerAndLogin(app, 'other@x.com');
    const resume = await a.agent.post('/api/documents').send({ kind: 'resume', text: 'Jane\nSKILLS\nReact' });
    expect((await b.agent.get(`/api/documents/${resume.body.id}/ats`)).status).toBe(404);
  });
});
