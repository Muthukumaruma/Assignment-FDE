/**
 * Section-aware chunking for resumes and job descriptions.
 *
 * Why: these documents are short and highly structured. Splitting on their own
 * headings keeps "Requirements" separate from "Benefits", so retrieval returns
 * the part of the document the question is about, and citations can name the section.
 */

export interface DocChunk {
  section: string;
  text: string;
  order: number;
}

const KNOWN_HEADINGS = [
  'summary', 'professional summary', 'profile', 'objective', 'about me',
  'skills', 'technical skills', 'core skills', 'key skills', 'tech stack',
  'experience', 'work experience', 'professional experience', 'employment', 'employment history',
  'projects', 'education', 'certifications', 'achievements', 'awards', 'languages',
  'responsibilities', 'key responsibilities', 'requirements', 'qualifications', 'minimum qualifications',
  'preferred qualifications', "what you'll do", 'what you will do', "what we're looking for",
  'what we are looking for', 'nice to have', 'nice-to-have', 'preferred', 'bonus', 'benefits',
  'perks', 'about us', 'about the role', 'about the company', 'the role', 'who you are',
];

function isHeading(line: string): boolean {
  const t = line.trim().replace(/:$/, '').trim();
  if (!t || t.length > 40) return false;
  if (KNOWN_HEADINGS.includes(t.toLowerCase().replace(/[’`]/g, "'"))) return true;
  // ALL CAPS short lines ("TECHNICAL SKILLS") are almost always headings in resumes.
  const words = t.split(/\s+/);
  return words.length <= 5 && /[A-Z]/.test(t) && t === t.toUpperCase() && /^[A-Z &/'-]+$/.test(t);
}

function titleCase(s: string): string {
  return s
    .replace(/:$/, '')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
}

export function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*[•▪●◦·*][ \t]*/gm, '- ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Splits text into windows of at most maxChars, preferring sentence/line boundaries, with overlap. */
function splitLong(text: string, maxChars: number, overlap: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. '));
      if (cut > maxChars * 0.5) end = start + cut + 1;
    }
    parts.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return parts;
}

export function chunkDocument(text: string, opts: { maxChars?: number; overlap?: number } = {}): DocChunk[] {
  const maxChars = opts.maxChars ?? 3200; // ≈800 tokens
  const overlap = opts.overlap ?? 400; // ≈100 tokens

  const sections: { section: string; lines: string[] }[] = [{ section: 'General', lines: [] }];
  for (const line of normalize(text).split('\n')) {
    if (isHeading(line)) sections.push({ section: titleCase(line), lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }

  const chunks: DocChunk[] = [];
  for (const { section, lines } of sections) {
    const body = lines.join('\n').trim();
    if (!body) continue;
    for (const piece of splitLong(body, maxChars, overlap)) {
      chunks.push({ section, text: piece, order: chunks.length });
    }
  }
  return chunks;
}
