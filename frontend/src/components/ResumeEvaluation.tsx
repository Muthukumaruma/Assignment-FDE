import { Check, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AtsCheck, Doc } from '../types';
import { ringColor } from './FitRing';
import { CRITERIA, criterionScore } from './Scorecard';

interface Props {
  resumeId: string;
  jobs: Doc[];
  onRescore: () => void;
  rescoring?: boolean;
}

/**
 * The resume's evaluation: every job side by side per criterion (best score per row highlighted),
 * plus a rule-based ATS checklist for the resume itself.
 */
export default function ResumeEvaluation({ resumeId, jobs, onRescore, rescoring = false }: Props) {
  const [checks, setChecks] = useState<AtsCheck[] | null>(null);

  useEffect(() => {
    api
      .get<{ checks: AtsCheck[] }>(`/api/documents/${resumeId}/ats`)
      .then((r) => setChecks(r.checks))
      .catch(() => setChecks([]));
  }, [resumeId]);

  const needsRescore = jobs.some((j) => !j.analysis?.scorecard || j.analysisStale);

  return (
    <div className="space-y-8">
      {jobs.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-sage">Scores by job</h3>
            {needsRescore && (
              <button type="button" onClick={onRescore} disabled={rescoring} className="btn-ghost px-2.5 py-1 text-xs">
                <RefreshCw size={12} className={rescoring ? 'animate-spin' : undefined} /> Re-score all jobs
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-pine text-sage">
                  <th className="py-2 pr-3 text-left font-medium">Evaluation</th>
                  {jobs.map((j) => (
                    <th key={j.id} className="px-2 py-2 text-right font-medium" title={j.title}>
                      {j.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CRITERIA.map(({ key, label }) => {
                  const scores = jobs.map((j) => (j.analysisStale ? undefined : criterionScore(j.analysis, key)?.score));
                  const best = Math.max(...scores.map((s) => s ?? -1));
                  const overall = key === 'overall';
                  return (
                    <tr key={key} aria-label={label} className={overall ? 'border-t border-pine' : 'border-b border-pine/40'}>
                      <td className={`py-2 pr-3 ${overall ? 'font-semibold text-mint' : 'text-mint/90'}`}>{label}</td>
                      {scores.map((s, i) => (
                        <td key={jobs[i].id} className="px-2 py-2 text-right">
                          {s === undefined ? (
                            <span className="text-sage">–</span>
                          ) : (
                            <span
                              data-best={s === best && jobs.length > 1 ? 'true' : undefined}
                              className={`inline-block min-w-9 rounded-md px-1.5 py-0.5 text-center font-display font-bold tabular-nums ${
                                s === best && jobs.length > 1 ? 'bg-lime/15 ring-1 ring-lime/40' : ''
                              }`}
                              style={{ color: ringColor(s) }}
                            >
                              {s}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-sage">Highlighted: the job where you score best on that criterion.</p>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-sage">ATS checklist</h3>
        {checks === null ? (
          <p className="text-sm text-sage">Checking your resume…</p>
        ) : (
          <ul className="space-y-2.5">
            {checks.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <span
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${c.passed ? 'bg-lime/15 text-lime' : 'bg-rose/15 text-rose'}`}
                  aria-label={c.passed ? 'Passed' : 'Needs work'}
                >
                  {c.passed ? <Check size={12} /> : <X size={12} />}
                </span>
                <span>
                  <span className="block text-sm font-medium text-mint">{c.label}</span>
                  <span className="block text-xs text-sage">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
