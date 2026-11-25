import { describe, expect, it } from 'vitest';
import { resolveTargets } from '../src/rag/router.js';

const docs = [
  { id: 'r', kind: 'resume' as const, label: 'Resume', title: 'Alex CV' },
  { id: 'j1', kind: 'job' as const, label: 'Job #1', title: 'Senior Frontend Engineer', company: 'Acme Analytics' },
  { id: 'j2', kind: 'job' as const, label: 'Job #2', title: 'AI Forward Deployed Engineer', company: 'Nimbus AI' },
  { id: 'j3', kind: 'job' as const, label: 'Job #3', title: 'Full-Stack MERN Developer', company: 'Brightcart' },
];

describe('resolveTargets', () => {
  it('matches "Job #2"', () => {
    expect(resolveTargets('What skills am I missing for Job #2?', docs)).toEqual({ jobIds: ['j2'], missingRefs: [] });
  });
  it('matches several numeric forms: "job 1", "#3"', () => {
    expect(resolveTargets('compare job 1 and #3', docs).jobIds.sort()).toEqual(['j1', 'j3']);
  });
  it('matches by company or title substring', () => {
    expect(resolveTargets('Am I a fit for the Nimbus role?', docs).jobIds).toEqual(['j2']);
    expect(resolveTargets('prep me for the frontend engineer interview', docs).jobIds).toEqual(['j1']);
  });
  it('reports job numbers that do not exist', () => {
    expect(resolveTargets('How about Job #5?', docs)).toEqual({ jobIds: [], missingRefs: ['Job #5'] });
  });
  it('returns nothing for general questions', () => {
    expect(resolveTargets('Which job am I the best fit for?', docs)).toEqual({ jobIds: [], missingRefs: [] });
  });
  it('does not match short generic words like "AI" from company names', () => {
    expect(resolveTargets('what AI skills do I have?', docs).jobIds).toEqual([]);
  });
});
