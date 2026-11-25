import { Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../lib/errors.js';
import { DocumentModel } from '../models/Document.js';
import { LlmTrace } from '../models/LlmTrace.js';
import { User } from '../models/User.js';

const RoleBody = z.object({ role: z.enum(['user', 'admin']) });

/** Nearest-rank percentile on a sorted array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

/** Usage summary from llm_traces, optionally for a single user. Window: last 30 days. */
export async function usageSummary(userId?: string) {
  const match: Record<string, unknown> = { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } };
  if (userId) match.userId = new Types.ObjectId(userId);

  const [totals] = await LlmTrace.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        calls: { $sum: 1 },
        promptTokens: { $sum: '$promptTokens' },
        completionTokens: { $sum: '$completionTokens' },
        costUsd: { $sum: '$costUsd' },
      },
    },
  ]);
  const byOpRows = await LlmTrace.aggregate<{ _id: string; calls: number; costUsd: number; avgLatencyMs: number }>([
    { $match: match },
    { $group: { _id: '$op', calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' }, avgLatencyMs: { $avg: '$latencyMs' } } },
  ]);
  const latencies = (await LlmTrace.find(match, { latencyMs: 1, _id: 0 }).sort({ createdAt: -1 }).limit(5000).lean())
    .map((t) => t.latencyMs)
    .sort((a, b) => a - b);

  return {
    totals: {
      calls: totals?.calls ?? 0,
      promptTokens: totals?.promptTokens ?? 0,
      completionTokens: totals?.completionTokens ?? 0,
      costUsd: totals?.costUsd ?? 0,
    },
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    byOp: Object.fromEntries(
      byOpRows.map((r) => [r._id, { calls: r.calls, costUsd: r.costUsd, avgLatencyMs: Math.round(r.avgLatencyMs) }]),
    ),
  };
}

export function adminRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.get('/users', async (_req, res) => {
    const [users, counts] = await Promise.all([
      User.find({}, { passwordHash: 0, googleId: 0, sessionVersion: 0 }).sort({ createdAt: 1 }).lean(),
      DocumentModel.aggregate<{ _id: Types.ObjectId; n: number }>([{ $group: { _id: '$userId', n: { $sum: 1 } } }]),
    ]);
    const byUser = new Map(counts.map((c) => [String(c._id), c.n]));
    res.json(
      users.map((u) => ({
        id: String(u._id),
        email: u.email,
        name: u.name,
        role: u.role,
        avatarUrl: u.avatarUrl ?? undefined,
        createdAt: u.createdAt,
        docCount: byUser.get(String(u._id)) ?? 0,
      })),
    );
  });

  router.patch('/users/:id/role', async (req, res) => {
    const { role } = RoleBody.parse(req.body);
    const id = String(req.params.id);
    if (!isValidObjectId(id)) throw new HttpError(404, 'User not found');
    // Prevents locking the last admin out by accident.
    if (id === currentUser(req).id && role !== 'admin') throw new HttpError(400, 'You cannot remove your own admin role');
    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).lean();
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ id, role: user.role });
  });

  router.get('/usage', async (_req, res) => {
    const summary = await usageSummary();
    const perUser = await LlmTrace.aggregate<{ _id: Types.ObjectId; calls: number; costUsd: number }>([
      { $match: { userId: { $ne: null }, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } },
      { $group: { _id: '$userId', calls: { $sum: 1 }, costUsd: { $sum: '$costUsd' } } },
      { $sort: { costUsd: -1 } },
      { $limit: 50 },
    ]);
    const emails = new Map(
      (await User.find({ _id: { $in: perUser.map((p) => p._id) } }, { email: 1 }).lean()).map((u) => [String(u._id), u.email]),
    );
    res.json({
      ...summary,
      byUser: perUser.map((p) => ({ userId: String(p._id), email: emails.get(String(p._id)) ?? '(deleted)', calls: p.calls, costUsd: p.costUsd })),
    });
  });

  return router;
}

/** Signed-in user's own usage (shown in the workspace metrics popover). */
export function metricsRouter(): Router {
  return Router().get('/', requireAuth, async (req, res) => {
    res.json(await usageSummary(currentUser(req).id));
  });
}
