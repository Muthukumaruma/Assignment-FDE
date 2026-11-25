import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { z } from 'zod';
import { currentUser, requireAuth } from '../auth/middleware.js';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { DocumentModel } from '../models/Document.js';
import { filterCitations } from '../rag/citations.js';
import { buildContextBlock, retrieveContext, type ContextDoc } from '../rag/context.js';
import { checkInput, classifyTopic, MAX_QUESTION_CHARS, OFF_TOPIC_REPLY } from '../rag/guard.js';
import { buildMessages, summarizeDocs } from '../rag/prompt.js';
import type { AppDeps } from '../types.js';

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(20_000) }))
    .min(1)
    .max(50), // history is further budgeted in buildMessages
});

function sse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function chatRouter(deps: AppDeps): Router {
  const router = Router();

  // Per-user limit: each chat turn costs real money (embedding + 1-2 completions).
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: env.NODE_ENV === 'test' ? 1000 : 20,
    keyGenerator: (req) => currentUser(req).id,
    message: { error: 'Too many questions — please wait a minute.' },
  });

  router.post('/', requireAuth, limiter, async (req, res) => {
    const user = currentUser(req);
    const { messages } = Body.parse(req.body);
    const last = messages[messages.length - 1];
    if (last.role !== 'user') throw new HttpError(400, 'Last message must be from the user');
    const check = checkInput(last.content);
    if (!check.ok) {
      throw new HttpError(400, check.reason === 'too_long' ? `Question is too long (max ${MAX_QUESTION_CHARS} characters)` : 'Question is empty');
    }

    const ctx = { userId: user.id, requestId: String(req.id) };
    const started = Date.now();

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // tell nginx not to buffer the stream
    });
    res.flushHeaders();

    let aborted = false;
    res.on('close', () => (aborted = !res.writableFinished));

    try {
      if ((await classifyTopic(last.content, deps.llm, ctx)) === 'off_topic') {
        sse(res, 'token', { t: OFF_TOPIC_REPLY });
        sse(res, 'sources', { sources: [], text: OFF_TOPIC_REPLY });
        sse(res, 'done', {});
        res.end();
        return;
      }

      const docs = await DocumentModel.find({ userId: user.id }, { label: 1, kind: 1, title: 1, company: 1, rawText: 1 }).lean();
      const contextDocs: ContextDoc[] = docs.map((d) => ({
        id: String(d._id),
        kind: d.kind,
        label: d.label,
        title: d.title,
        company: d.company ?? undefined,
        chars: d.rawText.length,
      }));
      const retrieved = await retrieveContext(last.content, user.id, contextDocs, deps, ctx);

      const prompt = buildMessages({
        question: last.content,
        history: messages.slice(0, -1),
        contextBlock: buildContextBlock(retrieved.chunks),
        docsSummary: summarizeDocs(contextDocs),
        missingRefs: retrieved.missingRefs,
        hasResume: contextDocs.some((d) => d.kind === 'resume'),
      });

      let answer = '';
      for await (const t of deps.llm.chatStream(prompt, ctx)) {
        if (aborted) break; // user closed the tab / pressed stop: stop paying for tokens
        answer += t;
        sse(res, 'token', { t });
      }

      const { text, sources } = filterCitations(answer, [...new Set(retrieved.chunks.map((c) => c.label))]);
      sse(res, 'sources', { sources, text });
      sse(res, 'done', {});
      logger.info(
        {
          requestId: ctx.requestId,
          rag: {
            fullText: retrieved.fullText,
            chunks: retrieved.chunks.length,
            targetedJobs: retrieved.targetedJobIds.length,
            missingRefs: retrieved.missingRefs,
            sources: sources.length,
            latencyMs: Date.now() - started,
          },
        },
        'chat answered',
      );
    } catch (err) {
      logger.error({ err, requestId: ctx.requestId }, 'chat failed');
      sse(res, 'error', { error: 'Something went wrong while answering. Please try again.' });
    }
    res.end();
  });

  return router;
}
