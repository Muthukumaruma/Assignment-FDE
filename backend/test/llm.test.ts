import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { costUsd } from '../src/llm/pricing.js';
import { recordTrace } from '../src/llm/client.js';
import { LlmTrace } from '../src/models/LlmTrace.js';
import { startMemoryDb, stopMemoryDb } from './helpers.js';

describe('costUsd', () => {
  it('prices gpt-4o-mini at $0.15 in / $0.60 out per 1M tokens', () => {
    expect(costUsd('gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.75, 6);
  });
  it('prices text-embedding-3-small at $0.02 per 1M tokens', () => {
    expect(costUsd('text-embedding-3-small', 500_000, 0)).toBeCloseTo(0.01, 6);
  });
  it('matches dated model snapshots by prefix and returns 0 for unknown models', () => {
    expect(costUsd('gpt-4o-mini-2024-07-18', 1_000_000, 0)).toBeCloseTo(0.15, 6);
    expect(costUsd('some-future-model', 1_000_000, 1_000_000)).toBe(0);
  });
});

describe('recordTrace', () => {
  beforeAll(startMemoryDb);
  afterAll(stopMemoryDb);

  it('persists token usage, latency and computed cost', async () => {
    await recordTrace({ requestId: 'r1', op: 'chat', model: 'gpt-4o-mini', promptTokens: 1000, completionTokens: 500, latencyMs: 42 });
    const t = await LlmTrace.findOne({ requestId: 'r1' }).lean();
    expect(t).toMatchObject({ op: 'chat', promptTokens: 1000, completionTokens: 500, latencyMs: 42 });
    expect(t?.costUsd).toBeCloseTo(0.00045, 8);
  });

  it('never throws even if the write fails (tracing must not break user requests)', async () => {
    await expect(recordTrace({ requestId: 'r2', op: 'bogus' as never, model: 'm', latencyMs: 1 })).resolves.toBeUndefined();
  });
});
