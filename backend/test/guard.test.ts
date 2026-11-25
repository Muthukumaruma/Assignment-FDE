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
