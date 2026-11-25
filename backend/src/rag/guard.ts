import { logger } from '../lib/logger.js';
import type { LlmClient, LlmCtx } from '../types.js';

export const MAX_QUESTION_CHARS = 2000;
export const OFF_TOPIC_REPLY =
  "I can only help with your resume, the jobs you've uploaded, and interview preparation.";

export function checkInput(question: string): { ok: true } | { ok: false; reason: 'too_long' | 'empty' } {
  if (!question.trim()) return { ok: false, reason: 'empty' };
  if (question.length > MAX_QUESTION_CHARS) return { ok: false, reason: 'too_long' };
  return { ok: true };
}

// Questions containing these are clearly in scope: skip the classifier call (saves ~300ms and a few tokens).
const ON_TOPIC_HINTS =
  /\b(resume|cv|job|jobs|role|roles|skill|skills|experience|interview|fit|gap|gaps|missing|qualif\w*|requirement\w*|career|salary|hire|hiring|apply|application|cover letter|strength\w*|weakness\w*|#\d)\b/i;

const CLASSIFIER_PROMPT = `You are a strict topic filter for a career assistant that only discusses the user's resume,
their uploaded job descriptions, job fit, skill gaps, career advice and interview preparation.
Reply with exactly one word: on_topic or off_topic.
Greetings, thanks and follow-up questions to an ongoing career conversation are on_topic.`;

/**
 * Cheap LLM classifier for out-of-scope requests ("write a poem", "solve my homework").
 * Fails OPEN: if the classifier errors we answer anyway, because the main prompt already
 * restricts answers to the documents — a false refusal is worse UX than a polite grounded reply.
 */
export async function classifyTopic(question: string, llm: LlmClient, ctx: LlmCtx): Promise<'on_topic' | 'off_topic'> {
  if (ON_TOPIC_HINTS.test(question)) return 'on_topic';
  try {
    const verdict = await llm.complete(
      [
        { role: 'system', content: CLASSIFIER_PROMPT },
        { role: 'user', content: question.slice(0, 500) },
      ],
      ctx,
      'guard',
    );
    return verdict.trim().toLowerCase().startsWith('off_topic') ? 'off_topic' : 'on_topic';
  } catch (err) {
    logger.warn({ err, requestId: ctx.requestId }, 'topic classifier failed; failing open');
    return 'on_topic';
  }
}
