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
