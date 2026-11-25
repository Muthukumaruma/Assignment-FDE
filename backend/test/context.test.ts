import { describe, expect, it } from 'vitest';
import { buildContextBlock, retrieveContext } from '../src/rag/context.js';
import type { RetrievedChunk, Retriever } from '../src/types.js';
import { fakeLlm } from './fakes.js';

const chunk = (label: string, section: string, text: string, docId = label): RetrievedChunk => ({ docId, label, section, text, score: 1 });

describe('buildContextBlock', () => {
  it('wraps chunks in labelled document tags and escapes angle brackets', () => {
    const out = buildContextBlock([chunk('Job #2', 'Requirements', 'Use <b>RAG</b>')]);
    expect(out).toBe('<document label="Job #2" section="Requirements">\nUse &lt;b&gt;RAG&lt;/b&gt;\n</document>');
  });
  it('stays within the character budget', () => {
    const many = Array.from({ length: 50 }, (_, i) => chunk(`Job #${i}`, 'S', 'x'.repeat(1000)));
    expect(buildContextBlock(many).length).toBeLessThanOrEqual(24000);
  });
});

describe('retrieveContext', () => {
  const docs = [
    { id: 'r', kind: 'resume' as const, label: 'Resume', title: 'CV', chars: 30000 },
    { id: 'j1', kind: 'job' as const, label: 'Job #1', title: 'Frontend', chars: 30000 },
    { id: 'j2', kind: 'job' as const, label: 'Job #2', title: 'AI FDE', chars: 30000 },
  ];
  const ctx = { requestId: 't' };

  it('for a targeted question, searches only the target job and the resume', async () => {
    const calls: (string[] | undefined)[] = [];
    const retriever: Retriever = {
      search: async (q) => {
        calls.push(q.docIds);
        return [chunk(q.docIds?.[0] === 'r' ? 'Resume' : 'Job #2', 'S', 't', q.docIds?.[0])];
      },
    };
    const res = await retrieveContext('gaps for Job #2', 'u1', docs, { llm: fakeLlm(), retriever }, ctx);
    expect(calls).toEqual([['j2'], ['r']]);
    expect(res.chunks.map((c) => c.label)).toEqual(['Job #2', 'Resume']);
    expect(res.fullText).toBe(false);
  });

  it('for an untargeted question, guarantees resume chunks are present', async () => {
    const retriever: Retriever = {
      search: async (q) => (q.docIds?.[0] === 'r' ? [chunk('Resume', 'Skills', 'react', 'r')] : [chunk('Job #1', 'S', 'a', 'j1')]),
    };
    const res = await retrieveContext('best fit?', 'u1', docs, { llm: fakeLlm(), retriever }, ctx);
    expect(res.chunks.some((c) => c.label === 'Resume')).toBe(true);
  });

  it('uses the full text of every document when the whole corpus fits the budget', async () => {
    const small = docs.map((d) => ({ ...d, chars: 1000 }));
    const res = await retrieveContext('anything', 'u1', small, { llm: fakeLlm(), retriever: { search: async () => [] } }, ctx, async () => [
      chunk('Resume', 'Skills', 'all of it', 'r'),
    ]);
    expect(res.fullText).toBe(true);
    expect(res.chunks).toHaveLength(1);
  });

  it('passes missing job references through', async () => {
    const res = await retrieveContext('Job #5?', 'u1', docs, { llm: fakeLlm(), retriever: { search: async () => [] } }, ctx);
    expect(res.missingRefs).toEqual(['Job #5']);
  });
});
