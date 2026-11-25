import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FitDrawer from '../components/FitDrawer';
import type { Doc } from '../types';

const base: Doc = { id: 'd1', kind: 'job', label: 'Job #1', title: 'Dev', analysisStale: false, createdAt: '', hasFile: false };
const props = { hasResume: true, onClose: () => {}, onChanged: () => {}, onAsk: () => {} };

describe('FitDrawer original file', () => {
  it('offers a download link when the original file is stored', () => {
    render(<FitDrawer doc={{ ...base, hasFile: true, fileName: 'jd.pdf' }} {...props} />);
    expect(screen.getByRole('link', { name: /Download jd.pdf/ })).toHaveAttribute('href', '/api/documents/d1/file');
  });
  it('shows no download link for pasted documents', () => {
    render(<FitDrawer doc={base} {...props} />);
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
  });
});
