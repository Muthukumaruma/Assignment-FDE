import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { OFF_TOPIC_REPLY } from '../src/rag/guard.js';
import type { RetrievedChunk } from '../src/types.js';
import { fakeDeps, fakeLlm } from './fakes.js';
import { clearDb, registerAndLogin, startMemoryDb, stopMemoryDb } from './helpers.js';

const JOB = 'Platform Engineer — Acme\nRequirements\nKubernetes, Go';

/** Parses an SSE body into [{event, data}] */
function parseSse(body: string) {
  return body
    .trim()
    .split('\n\n')
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return { event, data: data ? JSON.parse(data) : undefined };
    });
}

describe('POST /api/chat', () => {
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);
  beforeEach(clearDb);

  it('streams tokens, then only the sources that point at real context documents', async () => {
    const llm = fakeLlm({ stream: ['Missing: Kubernetes ', '[Job #1 › Requirements] ', '[Job #7 › X]'] });
    const app = createApp(fakeDeps({ llm }));
    const { agent } = await registerAndLogin(app, 'c@x.com');
    await agent.post('/api/documents').send({ kind: 'job', text: JOB });

    const res = await agent.post('/api/chat').send({ messages: [{ role: 'user', content: 'What am I missing for Job #1?' }] }).buffer(true);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSse(res.text);
    const tokens = events.filter((e) => e.event === 'token').map((e) => e.data.t).join('');
    expect(tokens).toContain('Missing: Kubernetes');
    const sources = events.find((e) => e.event === 'sources')?.data.sources;
    expect(sources).toEqual([{ label: 'Job #1', section: 'Requirements' }]);
    expect(events.at(-1)?.event).toBe('done');
  });

  it('refuses off-topic questions without retrieving anything', async () => {
    let searched = false;
    const app = createApp(
      fakeDeps({
        llm: fakeLlm({ complete: 'off_topic' }),
        retriever: { search: async (): Promise<RetrievedChunk[]> => ((searched = true), []) },
      }),
    );
    const { agent } = await registerAndLogin(app, 'o@x.com');
    const res = await agent.post('/api/chat').send({ messages: [{ role: 'user', content: 'Write a poem about the sea' }] }).buffer(true);
    const text = parseSse(res.text).filter((e) => e.event === 'token').map((e) => e.data.t).join('');
    expect(text).toBe(OFF_TOPIC_REPLY);
    expect(searched).toBe(false);
  });

  it('tells the model when there is no resume', async () => {
    const llm = fakeLlm({ stream: ['ok'] });
    const app = createApp(fakeDeps({ llm }));
    const { agent } = await registerAndLogin(app, 'n@x.com');
    await agent.post('/api/documents').send({ kind: 'job', text: JOB });
    await agent.post('/api/chat').send({ messages: [{ role: 'user', content: 'Am I a fit for Job #1?' }] }).buffer(true);
    const chat = llm.calls.find((c) => c.op === 'chat');
    expect(chat?.messages.map((m) => m.content).join('\n')).toMatch(/no resume/i);
  });

  it('rejects an over-long question with 400 before streaming', async () => {
    const app = createApp(fakeDeps());
    const { agent } = await registerAndLogin(app, 'l@x.com');
    const res = await agent.post('/api/chat').send({ messages: [{ role: 'user', content: 'a'.repeat(2001) }] });
    expect(res.status).toBe(400);
  });

  it('emits an error event if the model fails mid-stream', async () => {
    const llm = { ...fakeLlm(), chatStream: async function* () { yield 'partial'; throw new Error('boom'); } };
    const app = createApp(fakeDeps({ llm }));
    const { agent } = await registerAndLogin(app, 'e@x.com');
    const res = await agent.post('/api/chat').send({ messages: [{ role: 'user', content: 'skills for job?' }] }).buffer(true);
    const events = parseSse(res.text);
    expect(events.some((e) => e.event === 'error')).toBe(true);
  });

  it('requires authentication', async () => {
    const app = createApp(fakeDeps());
    const { default: request } = await import('supertest');
    expect((await request(app).post('/api/chat').send({ messages: [] })).status).toBe(401);
  });
});
