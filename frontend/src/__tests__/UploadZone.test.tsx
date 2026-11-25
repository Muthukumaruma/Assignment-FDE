import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UploadZone from '../components/UploadZone';

describe('UploadZone', () => {
  it('switches the default to "Job description" once a resume appears after loading', () => {
    const { rerender } = render(<UploadZone hasResume={false} onAdded={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Resume' })).toHaveAttribute('aria-checked', 'true');
    rerender(<UploadZone hasResume onAdded={() => {}} />);
    expect(screen.getByRole('radio', { name: 'Job description' })).toHaveAttribute('aria-checked', 'true');
  });
});
