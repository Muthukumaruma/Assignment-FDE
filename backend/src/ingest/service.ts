import { HttpError } from '../lib/errors.js';
import { Chunk } from '../models/Chunk.js';
import { DocumentModel } from '../models/Document.js';
import type { LlmClient, LlmCtx } from '../types.js';
import { chunkDocument } from './chunker.js';

export interface IngestInput {
  userId: string;
  kind: 'resume' | 'job';
  title: string;
  company?: string;
  text: string;
}

/**
 * parse → chunk → embed → store. A user has one active resume: a new resume replaces the
 * old one and marks every job's fit analysis stale (it was computed against the old resume).
 */
export async function ingestDocument(input: IngestInput, llm: LlmClient, ctx: LlmCtx) {
  const chunks = chunkDocument(input.text);
  if (chunks.length === 0) throw new HttpError(422, 'No extractable text');

  // Embed before writing anything, so an OpenAI failure leaves no half-ingested document.
  // The label is prefixed so the vector carries "which document/section" context too.
  const embeddings = await llm.embed(
    chunks.map((c) => `${input.kind === 'resume' ? 'Resume' : 'Job'} – ${input.title} – ${c.section}\n${c.text}`),
    ctx,
  );

  let label = 'Resume';
  let jobNumber: number | undefined;
  if (input.kind === 'resume') {
    const old = await DocumentModel.find({ userId: input.userId, kind: 'resume' }, { _id: 1 }).lean();
    await deleteDocuments(old.map((d) => String(d._id)));
    await DocumentModel.updateMany({ userId: input.userId, kind: 'job' }, { analysisStale: true });
  } else {
    const last = await DocumentModel.findOne({ userId: input.userId, kind: 'job' }).sort({ jobNumber: -1 }).lean();
    jobNumber = (last?.jobNumber ?? 0) + 1;
    label = `Job #${jobNumber}`;
  }

  const doc = await DocumentModel.create({
    userId: input.userId,
    kind: input.kind,
    label,
    jobNumber,
    title: input.title,
    company: input.company,
    rawText: input.text,
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

export async function deleteDocuments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await Chunk.deleteMany({ docId: { $in: ids } });
  await DocumentModel.deleteMany({ _id: { $in: ids } });
}
