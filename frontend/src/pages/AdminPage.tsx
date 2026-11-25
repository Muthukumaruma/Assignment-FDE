import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import Background from '../components/Background';
import type { AdminUser, Role, Usage } from '../types';

const money = (n: number) => `$${n.toFixed(4)}`;

function Stat({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className="panel px-5 py-4">
      <dt className="text-sm text-sage">{label}</dt>
      <dd className="mt-1 font-display text-3xl font-bold text-mint tabular-nums">{value}</dd>
    </motion.div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<AdminUser[]>('/api/admin/users'), api.get<Usage>('/api/admin/usage')])
      .then(([u, s]) => {
        setUsers(u);
        setUsage(s);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  async function changeRole(id: string, role: Role) {
    setError(null);
    const previous = users;
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, role } : u)));
    try {
      await api.patch(`/api/admin/users/${id}/role`, { role });
    } catch (err) {
      setUsers(previous);
      setError(err instanceof Error ? err.message : 'Could not change role');
    }
  }

  const ops = usage ? Object.entries(usage.byOp).sort((a, b) => b[1].costUsd - a[1].costUsd) : [];
  const maxOpCost = ops.reduce((m, [, o]) => Math.max(m, o.costUsd), 1e-9);

  return (
    <div className="relative min-h-dvh px-6 py-8 sm:px-12">
      <Background />
      <div className="mx-auto max-w-6xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-sage hover:text-mint">
          <ArrowLeft size={15} /> Back to workspace
        </Link>
        <h1 className="mt-4 text-4xl font-bold text-mint">Admin</h1>
        <p className="mt-1 text-sage">Accounts, roles and AI usage across all users over the last 30 days.</p>

        {error && (
          <p role="alert" className="mt-6 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
            {error}
          </p>
        )}

        {usage && (
          <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat index={0} label="Model calls" value={usage.totals.calls.toLocaleString()} />
            <Stat index={1} label="Tokens" value={(usage.totals.promptTokens + usage.totals.completionTokens).toLocaleString()} />
            <Stat index={2} label="Spend" value={money(usage.totals.costUsd)} />
            <Stat index={3} label="Latency p95" value={`${usage.latency.p95} ms`} />
          </dl>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <section className="panel overflow-x-auto p-5">
            <h2 className="mb-4 text-lg font-semibold text-mint">Users</h2>
            <table className="w-full text-left text-sm">
              <thead className="text-sage">
                <tr className="border-b border-pine">
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Documents</th>
                  <th className="py-2 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-pine/50 last:border-0">
                    <td className="py-2.5 pr-3 text-mint">{u.email}</td>
                    <td className="py-2.5 pr-3 text-sage">{u.name}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{u.docCount}</td>
                    <td className="py-2.5">
                      <select
                        aria-label={`Role for ${u.email}`}
                        value={u.role}
                        disabled={u.id === user?.id}
                        title={u.id === user?.id ? 'You cannot change your own role' : undefined}
                        onChange={(e) => void changeRole(u.id, e.target.value as Role)}
                        className="rounded-lg border border-pine bg-moss px-2 py-1 text-mint disabled:opacity-60"
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="space-y-6">
            <section className="panel p-5">
              <h2 className="mb-4 text-lg font-semibold text-mint">Spend by operation</h2>
              <ul className="space-y-3">
                {ops.map(([op, o]) => (
                  <li key={op}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-mint capitalize">{op}</span>
                      <span className="text-sage tabular-nums">
                        {o.calls} calls, {money(o.costUsd)}, avg {o.avgLatencyMs} ms
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-moss">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(2, (o.costUsd / maxOpCost) * 100)}%` }}
                        transition={{ duration: 0.8 }}
                        className="h-full rounded-full bg-emerald"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel p-5">
              <h2 className="mb-4 text-lg font-semibold text-mint">Top users by spend</h2>
              <ul className="space-y-2 text-sm">
                {usage?.byUser?.map((u) => (
                  <li key={u.userId} className="flex justify-between gap-3">
                    <span className="truncate text-mint">{u.email}</span>
                    <span className="shrink-0 text-sage tabular-nums">{money(u.costUsd)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
