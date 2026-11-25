import type { AppDeps, ChatMsg, GoogleProfile, LlmClient, RetrievedChunk } from '../src/types.js';

/** Deterministic embedding: 8-dim vector from character codes. Good enough to exercise plumbing. */
export function fakeEmbedding(text: string): number[] {
  const v = new Array(8).fill(0);
  for (let i = 0; i < text.length; i++) v[i % 8] += text.charCodeAt(i) / 1000;
  return v;
}

export interface FakeLlm extends LlmClient {
  calls: { op: string; messages: ChatMsg[] }[];
}

export function fakeLlm(opts: { stream?: string[]; complete?: string; structured?: unknown } = {}): FakeLlm {
  const calls: FakeLlm['calls'] = [];
  return {
    calls,
    async embed(texts) {
      return texts.map(fakeEmbedding);
    },
    async *chatStream(messages) {
      calls.push({ op: 'chat', messages });
      for (const t of opts.stream ?? ['ok']) yield t;
    },
    async complete(messages, _ctx, op) {
      calls.push({ op, messages });
      return opts.complete ?? 'on_topic';
    },
    async structured(messages, schema) {
      calls.push({ op: 'analyze', messages });
      return schema.parse(opts.structured);
    },
  };
}

export function fakeDeps(overrides: Partial<AppDeps> = {}): AppDeps {
  return {
    llm: fakeLlm(),
    retriever: { search: async (): Promise<RetrievedChunk[]> => [] },
    google: {
      verify: async (credential: string): Promise<GoogleProfile> => JSON.parse(credential),
    },
    ...overrides,
  };
}

/** In-memory FileStore standing in for Cloudflare R2. */
export function fakeFileStore() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  return {
    objects,
    async put(key: string, body: Buffer, contentType: string) {
      objects.set(key, { body, contentType });
    },
    async get(key: string) {
      return objects.get(key) ?? null;
    },
    async delete(keys: string[]) {
      for (const k of keys) objects.delete(k);
    },
  };
}
