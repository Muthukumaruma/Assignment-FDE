import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type Request } from 'express';
import { isValidObjectId } from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { env } from '../config/env.js';
import { extractText } from '../ingest/extract.js';
import { deleteDocuments, ingestDocument } from '../ingest/service.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { DocumentModel, type DocumentDoc } from '../models/Document.js';
import type { AppDeps } from '../types.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const Body = z.object({
  kind: z.enum(['resume', 'job']),
  title: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  text: z.string().optional(), // length enforced below (413) after file extraction too
});

const SAMPLE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sample-data');

export function toPublicDoc(d: Omit<DocumentDoc, 'rawText'>) {
  return {
    id: String(d._id),
    kind: d.kind,
    label: d.label,
    title: d.title,
    company: d.company ?? undefined,
    analysis: d.analysis ?? undefined,
    analysisStale: d.analysisStale,
    createdAt: d.createdAt,
  };
}

/** Extracted text above this is rejected: bounds memory, chunk count and embedding cost per upload. */
export const MAX_TEXT_CHARS = 200_000;

/** "Senior Engineer — Acme" on the first line → { title, company } */
function titleFromText(text: string): { title: string; company?: string } {
  // Truncate BEFORE matching and use bounded quantifiers: an unbounded \s+ on a huge
  // whitespace run backtracks quadratically and would block the event loop.
  const first = text.trimStart().slice(0, 300).split('\n')[0].trim() || 'Untitled';
  const [title, company] = first.split(/\s{1,3}[—–-]\s{1,3}/);
  return { title: title.trim().slice(0, 200) || 'Untitled', company: company?.trim().slice(0, 200) || undefined };
}

export function documentsRouter(deps: AppDeps): Router {
  const router = Router();
  router.use(requireAuth);

  /** Notify listeners (fit analysis). Awaited in tests for determinism; background in prod. */
  async function notifyIngested(req: Request, userId: string, docId: string) {
    const p = deps.onIngested?.(userId, docId, String(req.id));
    if (!p) return;
    if (env.NODE_ENV === 'test') await p;
    else p.catch((err) => logger.error({ err, docId }, 'post-ingest hook failed'));
  }

  router.get('/', async (req, res) => {
    const docs = await DocumentModel.find({ userId: currentUser(req).id }, { rawText: 0 })
      .sort({ kind: -1, jobNumber: 1 }) // 'resume' > 'job' alphabetically → resume first
      .lean();
    res.json(docs.map((d) => toPublicDoc(d)));
  });

  router.post('/', upload.single('file'), async (req, res) => {
    const user = currentUser(req);
    const body = Body.parse(req.body);
    let text = body.text ?? '';
    let fallbackTitle: string | undefined;
    if (req.file) {
      text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
      fallbackTitle = path.parse(req.file.originalname).name;
    }
    if (text.length > MAX_TEXT_CHARS) throw new HttpError(413, 'Document too large (max 200,000 characters of text)');
    if (!text.trim()) throw new HttpError(422, 'No extractable text');
    const guessed = titleFromText(text);
    const doc = await ingestDocument(
      {
        userId: user.id,
        kind: body.kind,
        title: body.title || fallbackTitle || guessed.title,
        company: body.company || (req.file ? undefined : guessed.company),
        text,
      },
      deps.llm,
      { userId: user.id, requestId: String(req.id) },
    );
    await notifyIngested(req, user.id, String(doc._id));
    res.status(201).json(toPublicDoc(doc.toObject() as unknown as DocumentDoc));
  });

  router.post('/sample', async (req, res) => {
    const user = currentUser(req);
    const ctx = { userId: user.id, requestId: String(req.id) };
    const created = [];
    for (const [file, kind] of [['resume.txt', 'resume'], ['job1.txt', 'job'], ['job2.txt', 'job'], ['job3.txt', 'job']] as const) {
      const text = await readFile(path.join(SAMPLE_DIR, file), 'utf8');
      const doc = await ingestDocument({ userId: user.id, kind, text, ...titleFromText(text) }, deps.llm, ctx);
      created.push(doc);
    }
    for (const d of created.filter((d) => d.kind === 'job')) await notifyIngested(req, user.id, String(d._id));
    res.status(201).json(created.map((d) => toPublicDoc(d.toObject() as unknown as DocumentDoc)));
  });

  router.delete('/:id', async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    // Scoping the lookup by userId is the isolation boundary: another user's id behaves as "not found".
    if (!isValidObjectId(id) || !(await DocumentModel.exists({ _id: id, userId: user.id }))) {
      throw new HttpError(404, 'Document not found');
    }
    await deleteDocuments([id]);
    res.status(204).end();
  });

  return router;
}
