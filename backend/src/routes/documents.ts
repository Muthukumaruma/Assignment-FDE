import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type Request } from 'express';
import { isValidObjectId } from 'mongoose';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { analyzeJob } from '../analysis/service.js';
import { atsChecks } from '../resume/ats.js';
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
    hasFile: !!d.file?.key,
    fileName: d.file?.name ?? undefined,
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

/** Most jobs a user can compare at once: bounds storage and the cost of re-scoring on resume change. */
export const MAX_JOBS = 10;

export function documentsRouter(deps: AppDeps, opts: { costLimitPerWindow?: number } = {}): Router {
  const router = Router();
  router.use(requireAuth);

  // Uploads, sample loads and re-scoring each spend OpenAI tokens (embeddings and/or a fit
  // analysis), and sign-up is open on the public demo: budget them per user, like chat.
  const costLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: opts.costLimitPerWindow ?? (env.NODE_ENV === 'test' ? 1000 : 30),
    keyGenerator: (req) => currentUser(req).id,
    message: { error: 'Too many uploads or re-scores. Please wait a few minutes.' },
  });

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

  router.post('/', costLimiter, upload.single('file'), async (req, res) => {
    const user = currentUser(req);
    const body = Body.parse(req.body);
    if (body.kind === 'job' && (await DocumentModel.countDocuments({ userId: user.id, kind: 'job' })) >= MAX_JOBS) {
      throw new HttpError(409, `You can compare up to ${MAX_JOBS} jobs. Delete one to add another.`);
    }
    let text = body.text ?? '';
    let fileName: string | undefined;
    if (req.file) {
      text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
      fileName = path.parse(req.file.originalname).name;
    }
    if (text.length > MAX_TEXT_CHARS) throw new HttpError(413, 'Document too large (max 200,000 characters of text)');
    if (!text.trim()) {
      throw new HttpError(
        422,
        req.file
          ? 'No extractable text. If this is a scanned PDF, export it as a text PDF or use "Paste text".'
          : 'No extractable text',
      );
    }
    // The document's own first line ("Data Engineer — Foo Corp", or the candidate's name) beats
    // a filename like "jd_final_v3"; the filename is only a fallback.
    const guessed = titleFromText(text);
    const doc = await ingestDocument(
      {
        userId: user.id,
        kind: body.kind,
        title: body.title || (guessed.title !== 'Untitled' ? guessed.title : fileName) || 'Untitled',
        company: body.company || guessed.company,
        text,
        file: req.file ? { buffer: req.file.buffer, name: req.file.originalname, mimeType: req.file.mimetype } : undefined,
      },
      deps.llm,
      { userId: user.id, requestId: String(req.id) },
      deps.files,
    );
    await notifyIngested(req, user.id, String(doc._id));
    res.status(201).json(toPublicDoc(doc.toObject() as unknown as DocumentDoc));
  });

  router.post('/sample', costLimiter, async (req, res) => {
    const user = currentUser(req);
    if (await DocumentModel.exists({ userId: user.id })) {
      throw new HttpError(409, 'Sample data can only be loaded into an empty workspace.');
    }
    const ctx = { userId: user.id, requestId: String(req.id) };
    const created = [];
    for (const [file, kind] of [['resume.txt', 'resume'], ['job1.txt', 'job'], ['job2.txt', 'job'], ['job3.txt', 'job']] as const) {
      const text = await readFile(path.join(SAMPLE_DIR, file), 'utf8');
      const doc = await ingestDocument({ userId: user.id, kind, text, ...titleFromText(text) }, deps.llm, ctx);
      created.push(doc);
    }
    // The resume was ingested first, so notifying it analyses every sample job in one go.
    await notifyIngested(req, user.id, String(created[0]._id));
    res.status(201).json(created.map((d) => toPublicDoc(d.toObject() as unknown as DocumentDoc)));
  });

  router.post('/:id/analyze', costLimiter, async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    if (!isValidObjectId(id)) throw new HttpError(404, 'Document not found');
    res.json(await analyzeJob(user.id, id, deps.llm, { userId: user.id, requestId: String(req.id) }));
  });

  router.delete('/:id', async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    // Scoping the lookup by userId is the isolation boundary: another user's id behaves as "not found".
    if (!isValidObjectId(id) || !(await DocumentModel.exists({ _id: id, userId: user.id }))) {
      throw new HttpError(404, 'Document not found');
    }
    await deleteDocuments([id], deps.files);
    res.status(204).end();
  });

  router.get('/:id/ats', async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const doc = isValidObjectId(id) ? await DocumentModel.findOne({ _id: id, userId: user.id }, { kind: 1, rawText: 1 }).lean() : null;
    if (!doc) throw new HttpError(404, 'Document not found');
    if (doc.kind !== 'resume') throw new HttpError(400, 'The ATS checklist applies to resumes only');
    res.json({ checks: atsChecks(doc.rawText) });
  });

  router.get('/:id/file', async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);
    const doc = isValidObjectId(id) ? await DocumentModel.findOne({ _id: id, userId: user.id }, { file: 1 }).lean() : null;
    const stored = doc?.file?.key && deps.files ? await deps.files.get(doc.file.key) : null;
    if (!doc?.file || !stored) throw new HttpError(404, 'No original file for this document');
    // Always a download (never rendered inline), with a sanitised filename: the file is user content.
    const safeName = (doc.file.name ?? 'document').replace(/[^\w.\- ]/g, '_');
    res.set({
      'Content-Type': stored.contentType,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.send(Buffer.from(stored.body));
  });

  return router;
}
