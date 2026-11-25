import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Chunk } from '../src/models/Chunk.js';
import { DocumentModel } from '../src/models/Document.js';
import { fakeDeps } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

const JOB = 'Senior Engineer\nRequirements\nReact, Node.js, 5 years experience\nNice to have\nKubernetes';
const RESUME = 'Jane Doe\nSKILLS\nReact, Node, MongoDB\nEXPERIENCE\nAcme Corp 2019-2024';

describe('documents API', () => {
  const ingested: string[] = [];
  const app = createApp(fakeDeps({ onIngested: async (_u, docId) => void ingested.push(docId) }));
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(async () => {
    await clearDb();
    ingested.length = 0;
  });

  it('pasted jobs get sequential labels and their chunks are stored with userId and embeddings', async () => {
    const { agent, user } = await registerAndLogin(app, 'a@x.com');
    const r1 = await agent.post('/api/documents').send({ kind: 'job', title: 'Senior Engineer', company: 'Acme', text: JOB });
    const r2 = await agent.post('/api/documents').send({ kind: 'job', title: 'Other', text: JOB });
    expect(r1.status).toBe(201);
    expect(r1.body.label).toBe('Job #1');
    expect(r2.body.label).toBe('Job #2');
    expect(r1.body.rawText).toBeUndefined();
    const chunks = await Chunk.find({ docId: r1.body.id }).lean();
    expect(chunks.length).toBeGreaterThan(0);
    expect(String(chunks[0].userId)).toBe(user.id);
    expect(chunks[0].embedding).toHaveLength(8);
    expect(chunks.map((c) => c.section)).toContain('Requirements');
    expect(ingested).toEqual([r1.body.id, r2.body.id]);
  });

  it('uploads a .txt file through multipart', async () => {
    const { agent } = await registerAndLogin(app, 'f@x.com');
    const res = await agent.post('/api/documents').field('kind', 'resume').attach('file', Buffer.from(RESUME), 'cv.txt');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: 'resume', label: 'Resume', title: 'Jane Doe' });
  });

  it('uploaded files take title and company from the first line, not the filename', async () => {
    const { agent } = await registerAndLogin(app, 'title@x.com');
    const res = await agent.post('/api/documents').field('kind', 'job').attach('file', Buffer.from('Data Engineer — Foo Corp\nRequirements\nSpark'), 'jd_final_v3.txt');
    expect(res.body).toMatchObject({ title: 'Data Engineer', company: 'Foo Corp' });
  });

  it('a new resume replaces the old one and marks job analyses stale', async () => {
    const { agent } = await registerAndLogin(app, 'b@x.com');
    await agent.post('/api/documents').send({ kind: 'resume', title: 'Old CV', text: RESUME });
    const job = await agent.post('/api/documents').send({ kind: 'job', title: 'J', text: JOB });
    await DocumentModel.updateOne({ _id: job.body.id }, { analysis: { score: 50 } });
    await agent.post('/api/documents').send({ kind: 'resume', title: 'New CV', text: RESUME });
    const list = await agent.get('/api/documents');
    const resumes = list.body.filter((d: { kind: string }) => d.kind === 'resume');
    expect(resumes).toHaveLength(1);
    expect(resumes[0].title).toBe('New CV');
    expect(list.body[0].kind).toBe('resume'); // resume listed first
    expect((await DocumentModel.findById(job.body.id))?.analysisStale).toBe(true);
  });

  it('rejects documents with no extractable text with 422', async () => {
    const { agent } = await registerAndLogin(app, 'e@x.com');
    const res = await agent.post('/api/documents').send({ kind: 'job', title: 'Empty', text: '   \n  ' });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'No extractable text' });
  });

  it('rejects unsupported and oversized files', async () => {
    const { agent } = await registerAndLogin(app, 'z@x.com');
    const png = await agent.post('/api/documents').field('kind', 'job').attach('file', Buffer.from('x'), 'a.png');
    expect(png.status).toBe(415);
    const big = await agent.post('/api/documents').field('kind', 'job').attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 97), 'big.txt');
    expect(big.status).toBe(413);
  });

  it('rejects files whose extracted text exceeds 200k characters with 413', async () => {
    const { agent } = await registerAndLogin(app, 'huge@x.com');
    const res = await agent.post('/api/documents').field('kind', 'job').attach('file', Buffer.alloc(200_001, 97), 'huge.txt');
    expect(res.status).toBe(413);
  });

  it('handles a pathological very long first line quickly (no regex backtracking)', async () => {
    const { agent } = await registerAndLogin(app, 'redos@x.com');
    const evil = 'a' + ' '.repeat(150_000) + 'b\nRequirements\nReact';
    const started = Date.now();
    const res = await agent.post('/api/documents').send({ kind: 'job', text: evil });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(res.status).toBe(201);
    expect(res.body.title.length).toBeLessThanOrEqual(200);
  });

  it("one user cannot see or delete another user's documents", async () => {
    const a = await registerAndLogin(app, 'owner@x.com');
    const b = await registerAndLogin(app, 'intruder@x.com');
    const doc = await a.agent.post('/api/documents').send({ kind: 'job', title: 'Mine', text: JOB });
    expect((await b.agent.get('/api/documents')).body).toEqual([]);
    expect((await b.agent.delete(`/api/documents/${doc.body.id}`)).status).toBe(404);
    expect(await DocumentModel.exists({ _id: doc.body.id })).toBeTruthy();
  });

  it('delete removes the document and its chunks', async () => {
    const { agent } = await registerAndLogin(app, 'd@x.com');
    const doc = await agent.post('/api/documents').send({ kind: 'job', title: 'J', text: JOB });
    expect((await agent.delete(`/api/documents/${doc.body.id}`)).status).toBe(204);
    expect(await Chunk.countDocuments({ docId: doc.body.id })).toBe(0);
  });

  it('loads sample data (resume + 3 jobs)', async () => {
    const { agent } = await registerAndLogin(app, 's@x.com');
    const res = await agent.post('/api/documents/sample');
    expect(res.status).toBe(201);
    const labels = (await agent.get('/api/documents')).body.map((d: { label: string }) => d.label);
    expect(labels).toEqual(['Resume', 'Job #1', 'Job #2', 'Job #3']);
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/documents')).status).toBe(401);
  });
});
