import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { fakeDeps, fakeFileStore } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

const JD = Buffer.from('Data Engineer — Foo\nRequirements\nSpark');

describe('original files in object storage (R2)', () => {
  const store = fakeFileStore();
  const app = createApp(fakeDeps({ files: store }));
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(async () => {
    await clearDb();
    store.objects.clear();
  });

  it('stores the uploaded file under users/{userId}/{docId}.{ext}', async () => {
    const { agent, user } = await registerAndLogin(app, 'a@x.com');
    const res = await agent.post('/api/documents').field('kind', 'job').attach('file', JD, 'jd.txt');
    expect(res.body).toMatchObject({ hasFile: true, fileName: 'jd.txt' });
    expect([...store.objects.keys()]).toEqual([`users/${user.id}/${res.body.id}.txt`]);
  });

  it('lets the owner download the original, and nobody else', async () => {
    const a = await registerAndLogin(app, 'owner@x.com');
    const b = await registerAndLogin(app, 'other@x.com');
    const doc = await a.agent.post('/api/documents').field('kind', 'job').attach('file', JD, 'jd.txt');
    const file = await a.agent.get(`/api/documents/${doc.body.id}/file`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(file.status).toBe(200);
    expect(Buffer.compare(file.body as Buffer, JD)).toBe(0);
    expect(file.headers['content-disposition']).toContain('attachment; filename="jd.txt"');
    expect((await b.agent.get(`/api/documents/${doc.body.id}/file`)).status).toBe(404);
  });

  it('pasted documents have no file', async () => {
    const { agent } = await registerAndLogin(app, 'p@x.com');
    const doc = await agent.post('/api/documents').send({ kind: 'job', text: 'Dev — Acme\nRequirements\nGo' });
    expect(doc.body.hasFile).toBe(false);
    expect((await agent.get(`/api/documents/${doc.body.id}/file`)).status).toBe(404);
  });

  it('deleting a document, or replacing the resume, deletes the stored file', async () => {
    const { agent } = await registerAndLogin(app, 'd@x.com');
    const job = await agent.post('/api/documents').field('kind', 'job').attach('file', JD, 'jd.txt');
    await agent.post('/api/documents').field('kind', 'resume').attach('file', Buffer.from('Jane\nSKILLS\nGo'), 'cv.txt');
    await agent.post('/api/documents').field('kind', 'resume').attach('file', Buffer.from('Jane\nSKILLS\nRust'), 'cv2.txt');
    expect(store.objects.size).toBe(2); // job + newest resume
    await agent.delete(`/api/documents/${job.body.id}`);
    expect([...store.objects.keys()].some((k) => k.endsWith(`${job.body.id}.txt`))).toBe(false);
  });

  it('works without object storage configured (files are simply not kept)', async () => {
    const plain = createApp(fakeDeps());
    const { agent } = await registerAndLogin(plain, 'n@x.com');
    const res = await agent.post('/api/documents').field('kind', 'job').attach('file', JD, 'jd.txt');
    expect(res.status).toBe(201);
    expect(res.body.hasFile).toBe(false);
    expect((await request(plain).get(`/api/documents/${res.body.id}/file`)).status).toBe(401);
  });
});
