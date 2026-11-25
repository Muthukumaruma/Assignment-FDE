import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import ResumeEvaluation from '../components/ResumeEvaluation';
import Scorecard from '../components/Scorecard';
import type { Doc, FitAnalysis } from '../types';

vi.mock('../api/client', async (orig) => {
  const mod = await orig<typeof import('../api/client')>();
  return { ...mod, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(), upload: vi.fn() } };
});

const row = (score: number) => ({ score, note: `note ${score}` });
function analysis(overall: number, s: number[]): FitAnalysis {
  return {
    score: overall, matchedSkills: [], missingSkills: [], experienceAlignment: '', summary: '', interviewTopics: [],
    scorecard: { atsCompatibility: row(s[0]), keywordMatch: row(s[1]), technicalSkills: row(s[2]), experienceRelevance: row(s[3]), leadershipArchitecture: row(s[4]) },
  };
}
const job = (n: number, a?: FitAnalysis): Doc => ({ id: `j${n}`, kind: 'job', label: `Job #${n}`, title: `T${n}`, analysis: a, analysisStale: false, createdAt: '' });

describe('Scorecard', () => {
  it('shows the six criteria with scores, overall last', () => {
    render(<Scorecard analysis={analysis(70, [80, 60, 75, 65, 50])} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'ATS compatibility', 'JD keyword matching', 'Technical skills', 'Experience relevance', 'Leadership & architecture', 'Overall match',
    ]);
    expect(within(rows[5]).getByText('70')).toBeInTheDocument();
  });
});

describe('ResumeEvaluation', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async () => ({
      checks: [
        { id: 'contact', label: 'Contact details', passed: true, detail: 'Email and phone number found.' },
        { id: 'metrics', label: 'Measurable results', passed: false, detail: 'Only 1 quantified result found.' },
      ],
    }));
  });

  it('compares jobs per criterion and marks the best score in each row', async () => {
    render(<ResumeEvaluation resumeId="r" jobs={[job(1, analysis(70, [80, 60, 75, 65, 50])), job(2, analysis(85, [70, 90, 80, 85, 40]))]} onRescore={() => {}} />);
    const keywordRow = screen.getByRole('row', { name: /JD keyword matching/ });
    expect(within(keywordRow).getByText('90')).toHaveAttribute('data-best', 'true');
    expect(within(keywordRow).getByText('60')).not.toHaveAttribute('data-best');
  });

  it('shows a dash and a re-score prompt for jobs analysed before scorecards existed', async () => {
    render(<ResumeEvaluation resumeId="r" jobs={[job(1, { ...analysis(70, [1, 1, 1, 1, 1]), scorecard: undefined })]} onRescore={() => {}} />);
    expect(screen.getAllByText('–').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Re-score all jobs' })).toBeInTheDocument();
  });

  it('lists the ATS checklist from the API', async () => {
    render(<ResumeEvaluation resumeId="r" jobs={[]} onRescore={() => {}} />);
    expect(await screen.findByText('Only 1 quantified result found.')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/api/documents/r/ats');
  });
});
