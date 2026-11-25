import { describe, expect, it } from 'vitest';
import { chunkDocument, normalize } from '../src/ingest/chunker.js';

describe('chunkDocument', () => {
  it('splits on recognised headings and title-cases section names', () => {
    const text = 'Jane Doe\nFull-stack dev\n\nSKILLS\nReact, Node, MongoDB\n\nExperience:\nAcme 2020-2024 built things';
    const chunks = chunkDocument(text);
    expect(chunks.map((c) => c.section)).toEqual(['General', 'Skills', 'Experience']);
    expect(chunks[1].text).toContain('React, Node, MongoDB');
    expect(chunks.map((c) => c.order)).toEqual([0, 1, 2]);
  });

  it('recognises job description headings like "What you\'ll do" and "Nice to have"', () => {
    const text = "About the role\nWe build AI.\nWhat you'll do\nShip RAG apps.\nNice to have:\nKubernetes";
    expect(chunkDocument(text).map((c) => c.section)).toEqual(['About The Role', "What You'll Do", 'Nice To Have']);
  });

  it('returns a single General chunk when there are no headings', () => {
    const chunks = chunkDocument('just a paragraph of text about my career');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section).toBe('General');
  });

  it('splits long sections into chunks no larger than maxChars with overlap', () => {
    const sentence = 'I built a scalable service with Node and MongoDB. ';
    const body = Array.from({ length: 200 }, (_, i) => `${i}: ${sentence}`).join('');
    const chunks = chunkDocument(`Experience\n${body}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(3200);
    expect(chunks.every((c) => c.section === 'Experience')).toBe(true);
    // the tail of chunk N reappears at the start of chunk N+1
    const tail = chunks[0].text.slice(-150).trim();
    expect(chunks[1].text.startsWith(tail.slice(0, 40)) || chunks[1].text.includes(tail.slice(0, 40))).toBe(true);
  });

  it('drops empty sections', () => {
    const chunks = chunkDocument('SKILLS\n\nEDUCATION\nBSc Computer Science');
    expect(chunks.map((c) => c.section)).toEqual(['Education']);
  });
});

describe('normalize', () => {
  it('collapses whitespace and bullet glyphs but keeps line breaks', () => {
    expect(normalize('•  React\r\n\r\n\r\n▪ Node   js\t')).toBe('- React\n\n- Node js');
  });
});
