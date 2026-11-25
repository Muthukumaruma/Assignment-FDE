import { Types } from 'mongoose';
import { VECTOR_INDEX } from '../db/vectorIndex.js';
import { Chunk } from '../models/Chunk.js';
import type { RetrievedChunk, Retriever } from '../types.js';

/** MongoDB Atlas Vector Search. The userId pre-filter is mandatory: it is the tenant isolation boundary. */
export function createAtlasRetriever(): Retriever {
  return {
    async search({ userId, embedding, docIds, limit }) {
      const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
      if (docIds?.length) filter.docId = { $in: docIds.map((id) => new Types.ObjectId(id)) };
      const rows = await Chunk.aggregate<RetrievedChunk & { docId: Types.ObjectId }>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: 'embedding',
            queryVector: embedding,
            numCandidates: Math.max(limit * 10, 50),
            limit,
            filter,
          },
        },
        { $project: { _id: 0, docId: 1, label: 1, section: 1, text: 1, score: { $meta: 'vectorSearchScore' } } },
      ]);
      return rows.map((r) => ({ ...r, docId: String(r.docId) }));
    },
  };
}
