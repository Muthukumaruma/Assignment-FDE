import path from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { HttpError } from '../lib/errors.js';

/** Removes "-- 1 of 2 --" page-marker lines. [ \t] (not \s) so a match can never span lines. */
export function stripPageMarkers(text: string): string {
  return text.replace(/^[ \t]{0,10}-- \d{1,5} of \d{1,5} --[ \t]{0,10}$/gm, '');
}

export const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

/** Turns an uploaded file into plain text. Decides by extension first (browsers send unreliable MIME types). */
export async function extractText(buf: Buffer, mime: string, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.pdf' || mime === 'application/pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      // pdf-parse v2 joins pages with "-- 1 of 2 --" by default. Those markers would make a
      // scanned (text-less) PDF look non-empty and leak into chunks and citations, so join with
      // a newline instead, and strip any marker lines defensively.
      const { text } = await parser.getText({ pageJoiner: '\n' });
      return stripPageMarkers(text);
    } finally {
      await parser.destroy();
    }
  }
  if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (ext === '.txt' || ext === '.md' || mime.startsWith('text/')) {
    return buf.toString('utf8');
  }
  throw new HttpError(415, 'Unsupported file type. Upload a PDF, DOCX or TXT file.');
}
