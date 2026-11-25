import { AnimatePresence } from 'framer-motion';
import { FileUp, LogOut, Plus, RefreshCw, Shield, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Doc } from '../types';
import DocCard from './DocCard';
import FitRing from './FitRing';
import UploadZone from './UploadZone';

interface Props {
  docs: Doc[];
  loading: boolean;
  onOpen: (doc: Doc) => void;
  onDelete: (doc: Doc) => void;
  onChanged: () => void;
  onLoadSample: () => void;
  sampleBusy: boolean;
}

export default function Sidebar({ docs, loading, onOpen, onDelete, onChanged, onLoadSample, sampleBusy }: Props) {
  const { user, logout } = useAuth();
  const [adding, setAdding] = useState<'resume' | 'job' | null>(null);
  const resume = docs.find((d) => d.kind === 'resume');
  const jobs = docs.filter((d) => d.kind === 'job');

  function added() {
    setAdding(null);
    onChanged();
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-pine/70 bg-forest/70 backdrop-blur-xl">
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
        <FitRing score={72} size={28} stroke={4} />
        <span className="font-display text-lg font-semibold text-mint">CareerLens</span>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        {loading ? (
          <p className="px-1 text-sm text-sage">Loading documents…</p>
        ) : (
          <>
            {docs.length === 0 && (
              <div className="rounded-xl border border-pine bg-moss/50 p-4">
                <p className="font-medium text-mint">Start with your resume</p>
                <p className="mt-1 text-sm text-sage">Then add the job descriptions you are considering. Each job gets a fit score.</p>
                <button type="button" onClick={onLoadSample} disabled={sampleBusy} className="btn-ghost mt-3 w-full text-sm">
                  <Sparkles size={14} /> {sampleBusy ? 'Loading sample…' : 'Try with sample data'}
                </button>
              </div>
            )}

            <section aria-label="Resume">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-sage">Your resume</h2>
                <button
                  type="button"
                  onClick={() => setAdding(adding === 'resume' ? null : 'resume')}
                  aria-expanded={adding === 'resume'}
                  className={resume ? 'inline-flex items-center gap-1 text-xs text-sage hover:text-lime' : 'sr-only'}
                >
                  <RefreshCw size={12} /> Replace resume
                </button>
              </div>
              {resume ? (
                <ul>
                  <DocCard doc={resume} index={0} hasResume onOpen={() => onOpen(resume)} onDelete={() => onDelete(resume)} />
                </ul>
              ) : (
                adding !== 'resume' && (
                  <button type="button" onClick={() => setAdding('resume')} className="btn-primary w-full text-sm">
                    <FileUp size={15} /> Upload resume
                  </button>
                )
              )}
              <AnimatePresence>{adding === 'resume' && <UploadZone kind="resume" onDone={added} onCancel={() => setAdding(null)} />}</AnimatePresence>
            </section>

            <section aria-label="Jobs">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-sage">Jobs ({jobs.length})</h2>
                <button
                  type="button"
                  onClick={() => setAdding(adding === 'job' ? null : 'job')}
                  aria-expanded={adding === 'job'}
                  aria-label="Add job"
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald/50 px-2 py-1 text-xs font-medium text-emerald transition hover:border-lime hover:text-lime"
                >
                  <Plus size={13} /> Add job
                </button>
              </div>
              <AnimatePresence>{adding === 'job' && <UploadZone kind="job" onDone={added} onCancel={() => setAdding(null)} />}</AnimatePresence>
              {jobs.length === 0 && adding !== 'job' && (
                <p className="px-1 text-sm text-sage">No jobs yet. Add the job descriptions you want to compare against.</p>
              )}
              <ul className="mt-1.5 space-y-1.5">
                <AnimatePresence initial={false}>
                  {jobs.map((j, i) => (
                    <DocCard key={j.id} doc={j} index={i} hasResume={!!resume} onOpen={() => onOpen(j)} onDelete={() => onDelete(j)} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          </>
        )}
      </div>

      <footer className="flex items-center gap-2.5 border-t border-pine/70 px-4 py-3">
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full bg-pine font-semibold text-mint">{user?.name[0]?.toUpperCase()}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-mint">{user?.name}</span>
          <span className="block truncate text-xs text-sage">{user?.role === 'admin' ? 'Admin' : user?.email}</span>
        </span>
        {user?.role === 'admin' && (
          <Link to="/admin" className="rounded-lg p-1.5 text-sage hover:bg-moss hover:text-lime" aria-label="Admin dashboard" title="Admin dashboard">
            <Shield size={16} />
          </Link>
        )}
        <button type="button" onClick={() => void logout()} className="rounded-lg p-1.5 text-sage hover:bg-moss hover:text-rose" aria-label="Sign out" title="Sign out">
          <LogOut size={16} />
        </button>
      </footer>
    </aside>
  );
}
