import { Chunk } from '../models/Chunk.js';
import { logger } from '../lib/logger.js';

export const VECTOR_INDEX = 'chunk_vector_idx';
export const EMBED_DIMS = 1536;

/** Creates the Atlas Vector Search index on chunks.embedding if it does not exist yet. */
export async function ensureVectorIndex(): Promise<void> {
  const coll = Chunk.collection;
  try {
    // Search indexes need the collection to exist. Model.createCollection is a no-op if it already does.
    await Chunk.createCollection();
    const existing = await coll.listSearchIndexes(VECTOR_INDEX).toArray();
    if (existing.length > 0) return;
    await coll.createSearchIndex({
      name: VECTOR_INDEX,
      type: 'vectorSearch',
      definition: {
        fields: [
          { type: 'vector', path: 'embedding', numDimensions: EMBED_DIMS, similarity: 'cosine' },
          { type: 'filter', path: 'userId' },
          { type: 'filter', path: 'docId' },
          { type: 'filter', path: 'kind' },
        ],
      },
    });
    logger.info('created vector search index (it may take ~1 minute to become queryable)');
  } catch (err) {
    logger.warn({ err }, 'could not ensure vector index — is this an Atlas / atlas-local deployment?');
  }
}
