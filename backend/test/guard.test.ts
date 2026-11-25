import { describe, expect, it } from 'vitest';
import { checkInput, classifyTopic } from '../src/rag/guard.js';
import { fakeLlm } from './fakes.js';

describe('checkInput', () => {
  it('rejects questions over 2000 characters', () => {
    expect(checkInput('a'.repeat(2001))).toEqual({ ok: false, reason: 'too_long' });
  });
  it('rejects blank questions', () => {
    expect(checkInput('   ')).toEqual({ ok: false, reason: 'empty' });
  });
  it('accepts a normal question', () => {
    expect(checkInput('What am I missing for Job #2?')).toEqual({ ok: true });
  });
});

describe('classifyTopic', () => {
  const ctx = { requestId: 't' };
  it('returns off_topic when the classifier says so', async () => {
    expect(await classifyTopic('write me a poem about cats', fakeLlm({ complete: 'off_topic' }), ctx)).toBe('off_topic');
  });
  it('fails open to on_topic on unexpected output or errors', async () => {
    expect(await classifyTopic('q', fakeLlm({ complete: 'banana' }), ctx)).toBe('on_topic');
    const broken = { ...fakeLlm(), complete: async () => { throw new Error('down'); } };
    expect(await classifyTopic('q', broken, ctx)).toBe('on_topic');
  });
  it('skips the LLM call for obviously on-topic questions', async () => {
    const llm = fakeLlm({ complete: 'off_topic' });
    expect(await classifyTopic('What skills am I missing for Job #2?', llm, ctx)).toBe('on_topic');
    expect(llm.calls).toHaveLength(0);
  });
});

describe('classifyTopic: self-development questions are in scope', () => {
  const ctx = { requestId: 't' };
  it.each([
    'what i need to learn?',
    'What should I study next?',
    'how can I improve?',
    'which certification should I get',
    'help me upskill',
    'what should I focus on to get hired',
  ])('treats "%s" as on topic without asking the model', async (q) => {
    const llm = fakeLlm({ complete: 'off_topic' });
    expect(await classifyTopic(q, llm, ctx)).toBe('on_topic');
    expect(llm.calls).toHaveLength(0);
  });

  it('tells the classifier to answer on_topic when unsure', async () => {
    const llm = fakeLlm({ complete: 'on_topic' });
    await classifyTopic('hmm, what now?', llm, ctx);
    expect(llm.calls[0].messages[0].content).toMatch(/unsure.*on_topic/is);
  });
});
