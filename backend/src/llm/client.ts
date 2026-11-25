import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { ZodType } from 'zod';
import { logger } from '../lib/logger.js';
import { LlmTrace } from '../models/LlmTrace.js';
import type { ChatMsg, LlmClient, LlmCtx } from '../types.js';
import { costUsd } from './pricing.js';

type Op = 'embed' | 'chat' | 'analyze' | 'guard';

interface TraceInput {
  userId?: string;
  requestId: string;
  op: Op;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

/** Persists one LLM call for the metrics/admin views. Best effort: never fails the user's request. */
export async function recordTrace(t: TraceInput): Promise<void> {
  const promptTokens = t.promptTokens ?? 0;
  const completionTokens = t.completionTokens ?? 0;
  const cost = costUsd(t.model, promptTokens, completionTokens);
  logger.info({ llm: { ...t, costUsd: cost } }, 'llm call');
  try {
    await LlmTrace.create({ ...t, promptTokens, completionTokens, costUsd: cost });
  } catch (err) {
    logger.warn({ err }, 'failed to record llm trace');
  }
}

const EMBED_BATCH = 100;

export function createOpenAiClient(opts: { apiKey: string; chatModel: string; embedModel: string }): LlmClient {
  const openai = new OpenAI({ apiKey: opts.apiKey, maxRetries: 2, timeout: 60_000 });

  const trace = (ctx: LlmCtx, op: Op, model: string, started: number, usage?: { prompt_tokens?: number; completion_tokens?: number } | null) =>
    recordTrace({
      userId: ctx.userId,
      requestId: ctx.requestId,
      op,
      model,
      promptTokens: usage?.prompt_tokens,
      completionTokens: usage?.completion_tokens,
      latencyMs: Date.now() - started,
    });

  return {
    async embed(texts, ctx) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const started = Date.now();
        const res = await openai.embeddings.create({ model: opts.embedModel, input: texts.slice(i, i + EMBED_BATCH) });
        await trace(ctx, 'embed', opts.embedModel, started, { prompt_tokens: res.usage.prompt_tokens });
        out.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
      }
      return out;
    },

    async *chatStream(messages: ChatMsg[], ctx) {
      const started = Date.now();
      const stream = await openai.chat.completions.create({
        model: opts.chatModel,
        messages,
        temperature: 0.2,
        stream: true,
        stream_options: { include_usage: true },
      });
      let usage: OpenAI.CompletionUsage | undefined | null;
      for await (const part of stream) {
        if (part.usage) usage = part.usage;
        const delta = part.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
      await trace(ctx, 'chat', opts.chatModel, started, usage);
    },

    async complete(messages, ctx, op) {
      const started = Date.now();
      const res = await openai.chat.completions.create({ model: opts.chatModel, messages, temperature: 0, max_tokens: 10 });
      await trace(ctx, op, opts.chatModel, started, res.usage);
      return res.choices[0]?.message?.content?.trim() ?? '';
    },

    async structured<T>(messages: ChatMsg[], schema: ZodType<T>, name: string, ctx: LlmCtx): Promise<T> {
      const started = Date.now();
      const res = await openai.chat.completions.create({
        model: opts.chatModel,
        messages,
        temperature: 0.1,
        // Structured outputs: the model is constrained to this JSON schema; we still validate with zod.
        response_format: zodResponseFormat(schema as never, name),
      });
      await trace(ctx, 'analyze', opts.chatModel, started, res.usage);
      const content = res.choices[0]?.message?.content ?? '{}';
      return schema.parse(JSON.parse(content));
    },
  };
}
