// Interfaces for everything that talks to the outside world.
// createApp receives implementations, so tests can swap in fakes.

export type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };
export interface LlmCtx {
  userId?: string;
  requestId: string;
}

export interface LlmClient {
  embed(texts: string[], ctx: LlmCtx): Promise<number[][]>;
  chatStream(messages: ChatMsg[], ctx: LlmCtx): AsyncIterable<string>;
  complete(messages: ChatMsg[], ctx: LlmCtx, op: 'guard' | 'chat'): Promise<string>;
  structured<T>(messages: ChatMsg[], schema: import('zod').ZodType<T>, name: string, ctx: LlmCtx): Promise<T>;
}

export interface RetrievedChunk {
  docId: string;
  label: string;
  section: string;
  text: string;
  score: number;
}

export interface Retriever {
  search(q: { userId: string; embedding: number[]; docIds?: string[]; limit: number }): Promise<RetrievedChunk[]>;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export interface GoogleVerifier {
  verify(credential: string): Promise<GoogleProfile>;
}

/** Object storage for original uploads (Cloudflare R2 in production). */
export interface FileStore {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}

export interface AppDeps {
  llm: LlmClient;
  retriever: Retriever;
  google: GoogleVerifier;
  /** Optional: when absent, uploads are parsed but the original file is not kept. */
  files?: FileStore;
  /** Called after a document is ingested (used to trigger fit analysis). Awaited in tests. */
  onIngested?: (userId: string, docId: string, requestId: string) => Promise<void>;
}
