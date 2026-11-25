import { describe, expect, it } from 'vitest';
import { buildMessages } from '../src/rag/prompt.js';
import type { ChatMsg } from '../src/types.js';

const base = { question: 'Q?', history: [] as ChatMsg[], contextBlock: '<document label="Resume" section="Skills">x</document>', docsSummary: 'Resume; Job #1: Dev at Acme', missingRefs: [] as string[], hasResume: true };

describe('buildMessages', () => {
  it('starts with a system prompt that marks documents as untrusted data and demands citations', () => {
    const [sys] = buildMessages(base);
    expect(sys.role).toBe('system');
    expect(sys.content).toMatch(/untrusted/i);
    expect(sys.content).toContain('[Job #2 › Requirements]');
    expect(sys.content).toContain("I can't find that in your documents");
  });
  it('keeps only the last 6 history turns, then the context + question as the final user message', () => {
    const history: ChatMsg[] = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `h${i}` }));
    const msgs = buildMessages({ ...base, history });
    expect(msgs.slice(1, -1).map((m) => m.content)).toEqual(['h4', 'h5', 'h6', 'h7', 'h8', 'h9']);
    const last = msgs[msgs.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toContain('<document label="Resume"');
    expect(last.content).toContain('Q?');
  });
  it('tells the model about missing job references', () => {
    const msgs = buildMessages({ ...base, missingRefs: ['Job #5'] });
    expect(msgs.map((m) => m.content).join('\n')).toMatch(/Job #5.*not.*uploaded/i);
  });
  it('tells the model when no resume is uploaded', () => {
    const msgs = buildMessages({ ...base, hasResume: false });
    expect(msgs.map((m) => m.content).join('\n')).toMatch(/no resume/i);
  });
});
