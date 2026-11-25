import { Chunk } from '../models/Chunk.js';
import type { LlmClient, LlmCtx, RetrievedChunk, Retriever } from '../types.js';
import { resolveTargets, type RoutableDoc } from './router.js';

export const CONTEXT_CHAR_BUDGET = 24_000; // ≈6k tokens
const PER_DOC_K = 4;
const GLOBAL_K = 8;
const MIN_RESUME_CHUNKS = 2;

export interface ContextDoc extends RoutableDoc {
  /** Length of the document's raw text, used to decide whether everything fits. */
  chars: number;
}

export interface RetrievedContext {
  chunks: RetrievedChunk[];
  missingRefs: string[];
  targetedJobIds: string[];
  /** True when the corpus was small enough to send every chunk instead of searching. */
  fullText: boolean;
}

type AllChunksLoader = (userId: string) => Promise<RetrievedChunk[]>;

const loadAllChunks: AllChunksLoader = async (userId) => {
  const rows = await Chunk.find({ userId }, { embedding: 0 }).sort({ kind: -1, label: 1, order: 1 }).lean();
  return rows.map((r) => ({ docId: String(r.docId), label: r.label, section: r.section, text: r.text, score: 1 }));
};

/**
 * Retrieval strategy:
 *  - Small corpus (one resume + a few JDs is usually < 6k tokens): skip search and send everything.
 *    Retrieval can only lose information; it earns its keep when the corpus outgrows the context window.
 *  - Question names specific jobs: search only those jobs + the resume, k per document.
 *  - Otherwise: global top-k, then make sure the resume is represented (every question here is
 *    "me vs. the job", so an answer without resume evidence is useless).
 */
export async function retrieveContext(
  question: string,
  userId: string,
  docs: ContextDoc[],
  deps: { llm: LlmClient; retriever: Retriever },
  ctx: LlmCtx,
  loadAll: AllChunksLoader = loadAllChunks,
): Promise<RetrievedContext> {
  const { jobIds, missingRefs } = resolveTargets(question, docs);
  const totalChars = docs.reduce((n, d) => n + d.chars, 0);
  if (totalChars <= CONTEXT_CHAR_BUDGET) {
    return { chunks: await loadAll(userId), missingRefs, targetedJobIds: jobIds, fullText: true };
  }

  const [embedding] = await deps.llm.embed([question], ctx);
  const resume = docs.find((d) => d.kind === 'resume');
  const search = (docIds: string[] | undefined, limit: number) => deps.retriever.search({ userId, embedding, docIds, limit });

  let chunks: RetrievedChunk[] = [];
  if (jobIds.length > 0) {
    for (const id of jobIds) chunks.push(...(await search([id], PER_DOC_K)));
    if (resume) chunks.push(...(await search([resume.id], PER_DOC_K)));
  } else {
    chunks = await search(undefined, GLOBAL_K);
    const resumeHits = chunks.filter((c) => c.docId === resume?.id).length;
    if (resume && resumeHits < MIN_RESUME_CHUNKS) {
      const extra = await search([resume.id], MIN_RESUME_CHUNKS);
      const seen = new Set(chunks.map((c) => `${c.docId}:${c.text}`));
      chunks.push(...extra.filter((c) => !seen.has(`${c.docId}:${c.text}`)));
    }
  }
  return { chunks, missingRefs, targetedJobIds: jobIds, fullText: false };
}

const escape = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Renders chunks as tagged blocks. Escaping stops document text from closing the tag and
 * smuggling "instructions" outside the data boundary (a simple prompt-injection defence).
 */
export function buildContextBlock(chunks: RetrievedChunk[], budget = CONTEXT_CHAR_BUDGET): string {
  const blocks: string[] = [];
  let used = 0;
  for (const c of chunks) {
    const block = `<document label="${escape(c.label)}" section="${escape(c.section)}">\n${escape(c.text)}\n</document>`;
    const cost = block.length + (blocks.length ? 2 : 0);
    if (used + cost > budget) break;
    blocks.push(block);
    used += cost;
  }
  return blocks.join('\n\n');
}
