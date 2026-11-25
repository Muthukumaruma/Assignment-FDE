import { AnimatePresence, motion } from 'framer-motion';
import { Download, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { Doc } from '../types';
import FitRing from './FitRing';
import ResumeEvaluation from './ResumeEvaluation';
import Scorecard from './Scorecard';

interface Props {
  doc: Doc | null;
  hasResume: boolean;
  /** All jobs, for the resume's side-by-side evaluation. */
  jobs?: Doc[];
  onClose: () => void;
  onChanged: () => void;
  onAsk: (question: string) => void;
}

function Chips({ items, tone }: { items: string[]; tone: 'match' | 'gap' }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <motion.li
          key={s}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 + i * 0.05, type: 'spring', stiffness: 380, damping: 18 }}
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone === 'match' ? 'bg-lime/10 text-lime ring-1 ring-lime/30' : 'bg-rose/10 text-rose ring-1 ring-rose/30'}`}
        >
          {s}
        </motion.li>
      ))}
    </ul>
  );
}

export default function FitDrawer({ doc, hasResume, jobs = [], onClose, onChanged, onAsk }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = doc?.analysis;

  async function rescoreAll() {
    setBusy(true);
    setError(null);
    try {
      await Promise.all(jobs.map((j) => api.post(`/api/documents/${j.id}/analyze`)));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-scoring failed');
    } finally {
      setBusy(false);
    }
  }

  async function reanalyze() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/documents/${doc.id}/analyze`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {doc && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-30 bg-night/60 backdrop-blur-sm" />
          <motion.aside
            role="dialog"
            aria-label={`${doc.label} fit details`}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-pine bg-forest ${doc.kind === 'resume' ? 'max-w-2xl' : 'max-w-md'}`}
          >
            <header className="flex items-start gap-4 border-b border-pine p-6">
              {doc.kind === 'job' && <FitRing score={doc.analysisStale ? undefined : a?.score} size={76} stroke={7} pending={busy || (hasResume && !a)} />}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-sage">{doc.label}</p>
                <h2 className="text-2xl leading-tight font-bold text-mint">{doc.title}</h2>
                {doc.company && <p className="text-sage">{doc.company}</p>}
                {doc.hasFile && (
                  <a
                    href={`/api/documents/${doc.id}/file`}
                    download
                    className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-emerald hover:text-lime"
                  >
                    <Download size={14} /> Download {doc.fileName ?? 'original'}
                  </a>
                )}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-sage hover:bg-moss hover:text-mint">
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 space-y-7 overflow-y-auto p-6">
              {doc.kind === 'resume' ? (
                <>
                  <p className="text-sage">Every job is scored against this resume. Upload a new one to replace it and re-score all jobs.</p>
                  <ResumeEvaluation resumeId={doc.id} jobs={jobs} onRescore={() => void rescoreAll()} rescoring={busy} />
                </>
              ) : !hasResume ? (
                <p className="text-sage">Add your resume to see how well you fit this job.</p>
              ) : !a ? (
                <p className="text-sage">Scoring this job against your resume…</p>
              ) : (
                <>
                  {doc.analysisStale && <p className="text-sm text-amber">Your resume changed since this score was computed.</p>}
                  <p className="text-lg leading-snug text-mint">{a.summary}</p>
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-sage">Evaluation</h3>
                    {a.scorecard ? (
                      <Scorecard analysis={a} />
                    ) : (
                      <p className="text-sm text-sage">Re-score this job (button below) to get the detailed scorecard.</p>
                    )}
                  </section>
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-sage">You already have</h3>
                    <Chips items={a.matchedSkills} tone="match" />
                  </section>
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-sage">Skill gaps</h3>
                    {a.missingSkills.length ? <Chips items={a.missingSkills} tone="gap" /> : <p className="text-sm text-sage">No notable gaps.</p>}
                  </section>
                  <section>
                    <h3 className="mb-1.5 text-sm font-semibold text-sage">Experience</h3>
                    <p className="text-mint/90">{a.experienceAlignment}</p>
                  </section>
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-sage">Prepare for these topics</h3>
                    <ul className="space-y-1.5">
                      {a.interviewTopics.map((t) => (
                        <li key={t} className="flex gap-2 text-mint/90">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
              {error && <p role="alert" className="text-sm text-rose">{error}</p>}
            </div>

            {doc.kind === 'job' && hasResume && (
              <footer className="flex gap-2 border-t border-pine p-4">
                <button type="button" className="btn-primary flex-1" onClick={() => onAsk(`Prepare me for the ${doc.label} interview`)}>
                  Practise for this interview
                </button>
                <button type="button" className="btn-ghost" onClick={() => void reanalyze()} disabled={busy} aria-label="Re-score this job">
                  <RefreshCw size={16} className={busy ? 'animate-spin' : undefined} />
                </button>
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
