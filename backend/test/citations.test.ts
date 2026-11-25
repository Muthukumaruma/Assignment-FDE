import { describe, expect, it } from 'vitest';
import { filterCitations } from '../src/rag/citations.js';

describe('filterCitations', () => {
  it('keeps citations to retrieved labels, strips invented ones, and dedupes sources', () => {
    const out = filterCitations('x [Job #9 › Skills] y [Resume › Skills] z [Resume › Skills]', ['Resume']);
    expect(out.text).toBe('x y [Resume › Skills] z [Resume › Skills]');
    expect(out.sources).toEqual([{ label: 'Resume', section: 'Skills' }]);
  });
  it('accepts ">" as a separator too', () => {
    expect(filterCitations('a [Job #1 > Requirements]', ['Job #1']).sources).toEqual([{ label: 'Job #1', section: 'Requirements' }]);
  });
});

describe('filterCitations keeps markdown structure', () => {
  it('preserves nested list indentation and only removes the space before a dropped citation', () => {
    const answer = '- Gap [Resume › Skills]\n  - sub-point [Job #9 › X]\n    code-ish  spacing';
    expect(filterCitations(answer, ['Resume']).text).toBe('- Gap [Resume › Skills]\n  - sub-point\n    code-ish  spacing');
  });
});
