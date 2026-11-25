import { describe, expect, it } from 'vitest';
import { extractText } from '../src/ingest/extract.js';

describe('extractText', () => {
  it('reads plain text files', async () => {
    const text = await extractText(Buffer.from('Hello resume'), 'text/plain', 'cv.txt');
    expect(text).toBe('Hello resume');
  });

  it('rejects unsupported types with 415', async () => {
    await expect(extractText(Buffer.from('x'), 'image/png', 'a.png')).rejects.toMatchObject({ status: 415 });
  });
});

describe('extractText PDFs', () => {
  it('returns no text for an image-only (scanned) PDF, so ingestion can reject it', async () => {
    const { makePdf } = await import('./pdfFixture.js');
    const text = await extractText(makePdf([[], []]), 'application/pdf', 'scan.pdf');
    expect(text.trim()).toBe('');
  });

  it('does not inject page markers into multi-page text', async () => {
    const { makePdf } = await import('./pdfFixture.js');
    const text = await extractText(makePdf([['Page one text'], ['Page two text']]), 'application/pdf', 'cv.pdf');
    expect(text).toContain('Page one text');
    expect(text).toContain('Page two text');
    expect(text).not.toMatch(/-- \d+ of \d+ --/);
  });
});

describe('page-marker stripping performance', () => {
  it('is fast on huge whitespace runs', async () => {
    const { stripPageMarkers } = await import('../src/ingest/extract.js');
    const evil = ` ${'\n'.repeat(100_000)}x`;
    const t0 = Date.now();
    stripPageMarkers(evil);
    expect(Date.now() - t0).toBeLessThan(300);
    expect(stripPageMarkers('a\n-- 1 of 2 --\nb')).toBe('a\n\nb');
  });
});
