import { motion } from 'framer-motion';
import type { FitAnalysis, ScorecardKey } from '../types';
import { ringColor } from './FitRing';

export const CRITERIA: { key: ScorecardKey | 'overall'; label: string }[] = [
  { key: 'atsCompatibility', label: 'ATS compatibility' },
  { key: 'keywordMatch', label: 'JD keyword matching' },
  { key: 'technicalSkills', label: 'Technical skills' },
  { key: 'experienceRelevance', label: 'Experience relevance' },
  { key: 'leadershipArchitecture', label: 'Leadership & architecture' },
  { key: 'overall', label: 'Overall match' },
];

/** Reads one criterion from an analysis; "overall" is the fit score itself. */
export function criterionScore(a: FitAnalysis | undefined, key: ScorecardKey | 'overall'): { score: number; note?: string } | undefined {
  if (!a) return undefined;
  if (key === 'overall') return { score: a.score, note: a.summary };
  return a.scorecard?.[key];
}

/** One job's evaluation: a row per criterion with an animated bar and the model's evidence note. */
export default function Scorecard({ analysis }: { analysis: FitAnalysis }) {
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Criterion</th>
          <th>Score</th>
        </tr>
      </thead>
      <tbody>
        {CRITERIA.map(({ key, label }, i) => {
          const c = criterionScore(analysis, key);
          const overall = key === 'overall';
          return (
            <tr key={key} className={overall ? 'border-t border-pine' : undefined}>
              <td className={`py-2 pr-3 align-top ${overall ? 'font-semibold text-mint' : 'text-mint/90'}`}>{label}</td>
              <td className="w-[52%] py-2 align-top">
                {c ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-moss">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ background: ringColor(c.score) }}
                          initial={{ width: 0 }}
                          animate={{ width: `${c.score}%` }}
                          transition={{ duration: 0.8, delay: 0.1 + i * 0.07 }}
                        />
                      </div>
                      <span className="w-8 text-right font-display font-bold tabular-nums" style={{ color: ringColor(c.score) }}>
                        {c.score}
                      </span>
                    </div>
                    {!overall && c.note && <p className="mt-1 text-xs leading-snug text-sage">{c.note}</p>}
                  </>
                ) : (
                  <span className="text-sage">–</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
