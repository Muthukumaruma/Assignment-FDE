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
