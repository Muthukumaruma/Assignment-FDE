import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FitRing, { ringColor } from '../components/FitRing';

describe('FitRing', () => {
  it('shows the score as a percentage with an accessible label', () => {
    render(<FitRing score={64} />);
    expect(screen.getByText('64%')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Fit score 64%' })).toBeInTheDocument();
  });
  it('shows a pending state without a number', () => {
    render(<FitRing pending />);
    expect(screen.getByRole('img', { name: 'Fit score pending' })).toBeInTheDocument();
  });
  it('colours strong fits lime and weak fits rose', () => {
    expect(ringColor(90)).toContain('lime');
    expect(ringColor(20)).toContain('rose');
  });
});
