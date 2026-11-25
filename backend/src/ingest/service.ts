import path from 'node:path';
import { Types } from 'mongoose';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { Chunk } from '../models/Chunk.js';
import { DocumentModel } from '../models/Document.js';
import type { FileStore, LlmClient, LlmCtx } from '../types.js';
import { chunkDocument } from './chunker.js';

export interface IngestInput {
  userId: string;
  kind: 'resume' | 'job';
  title: string;
  company?: string;
  text: string;
  /** The original upload, kept in object storage when a FileStore is configured. */
  file?: { buffer: Buffer; name: string; mimeType: string };
}

/**
 * parse → chunk → embed → store. A user has one active resume: a new resume replaces the
 * old one and marks every job's fit analysis stale (it was computed against the old resume).
 */
export async function ingestDocument(input: IngestInput, llm: LlmClient, ctx: LlmCtx, files?: FileStore) {
  const chunks = chunkDocument(input.text);
  if (chunks.length === 0) throw new HttpError(422, 'No extractable text');

  // Embed before writing anything, so an OpenAI failure leaves no half-ingested document.
  // The label is prefixed so the vector carries "which document/section" context too.
  const embeddings = await llm.embed(
    chunks.map((c) => `${input.kind === 'resume' ? 'Resume' : 'Job'} – ${input.title} – ${c.section}\n${c.text}`),
    ctx,
  );

  // Upload the original before the DB write, so a document never points at a missing file.
  const docId = new Types.ObjectId();
  let file: { key: string; name: string; mimeType: string; size: number } | undefined;
  if (files && input.file) {
    const ext = path.extname(input.file.name).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const key = `users/${input.userId}/${docId}${ext}`;
    await files.put(key, input.file.buffer, input.file.mimeType);
    file = { key, name: input.file.name.slice(0, 200), mimeType: input.file.mimeType, size: input.file.buffer.length };
  }

  let label = 'Resume';
  let jobNumber: number | undefined;
  if (input.kind === 'resume') {
    const old = await DocumentModel.find({ userId: input.userId, kind: 'resume' }, { _id: 1 }).lean();
    await deleteDocuments(old.map((d) => String(d._id)), files);
    await DocumentModel.updateMany({ userId: input.userId, kind: 'job' }, { analysisStale: true });
  } else {
    const last = await DocumentModel.findOne({ userId: input.userId, kind: 'job' }).sort({ jobNumber: -1 }).lean();
    jobNumber = (last?.jobNumber ?? 0) + 1;
    label = `Job #${jobNumber}`;
  }

  const doc = await DocumentModel.create({
    _id: docId,
    userId: input.userId,
    kind: input.kind,
    label,
    jobNumber,
    title: input.title,
    company: input.company,
    rawText: input.text,
    file,
  });
  await Chunk.insertMany(
    chunks.map((c, i) => ({
      userId: input.userId,
      docId: doc._id,
      kind: input.kind,
      label,
      section: c.section,
      text: c.text,
      order: c.order,
      embedding: embeddings[i],
    })),
  );
  return doc;
}

export async function deleteDocuments(ids: string[], files?: FileStore): Promise<void> {
  if (ids.length === 0) return;
  if (files) {
    const keys = (await DocumentModel.find({ _id: { $in: ids }, 'file.key': { $exists: true } }, { 'file.key': 1 }).lean())
      .map((d) => d.file?.key)
      .filter((k): k is string => !!k);
    // Storage cleanup is best effort: a leftover object is harmless, a failed delete request is not.
    await files.delete(keys).catch((err) => logger.warn({ err, keys }, 'failed to delete stored files'));
  }
  await Chunk.deleteMany({ docId: { $in: ids } });
  await DocumentModel.deleteMany({ _id: { $in: ids } });
}
