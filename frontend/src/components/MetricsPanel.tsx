import { Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Usage } from '../types';

/** The signed-in user's own LLM usage over the last 30 days. */
export default function MetricsPanel() {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    if (open) api.get<Usage>('/api/metrics').then(setUsage).catch(() => setUsage(null));
  }, [open]);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="btn-ghost px-2.5 py-1.5 text-xs">
        <Activity size={14} /> Usage
      </button>
      {open && (
        <div className="panel absolute right-0 z-20 mt-2 w-64 p-4 text-sm">
          <p className="mb-3 font-display font-semibold text-mint">Your AI usage, last 30 days</p>
          {usage ? (
            <dl className="grid grid-cols-2 gap-y-2">
              <dt className="text-sage">Model calls</dt>
              <dd className="text-right tabular-nums">{usage.totals.calls}</dd>
              <dt className="text-sage">Tokens</dt>
              <dd className="text-right tabular-nums">{(usage.totals.promptTokens + usage.totals.completionTokens).toLocaleString()}</dd>
              <dt className="text-sage">Cost</dt>
              <dd className="text-right tabular-nums">${usage.totals.costUsd.toFixed(4)}</dd>
              <dt className="text-sage">Latency p95</dt>
              <dd className="text-right tabular-nums">{usage.latency.p95} ms</dd>
            </dl>
          ) : (
            <p className="text-sage">Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}
