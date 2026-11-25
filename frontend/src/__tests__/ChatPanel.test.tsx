import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { streamChat } from '../api/client';
import ChatPanel from '../components/ChatPanel';
import type { Doc } from '../types';

vi.mock('../api/client', async (orig) => {
  const mod = await orig<typeof import('../api/client')>();
  return { ...mod, streamChat: vi.fn() };
});

const docs: Doc[] = [
  { id: 'r', kind: 'resume', label: 'Resume', title: 'CV', analysisStale: false, createdAt: '' },
  { id: 'j1', kind: 'job', label: 'Job #1', title: 'Dev', analysisStale: false, createdAt: '' },
];

describe('ChatPanel', () => {
  it('streams the answer and renders citations as pills', async () => {
    vi.mocked(streamChat).mockImplementation(async (_m, h) => {
      h.onToken('Hello');
      h.onToken(' world [Job #1 › Skills]');
      h.onDone({ text: 'Hello world [Job #1 › Skills]', sources: [{ label: 'Job #1', section: 'Skills' }] });
    });
    render(<ChatPanel docs={docs} onOpenDoc={() => {}} />);
    await userEvent.type(screen.getByLabelText('Ask a question'), 'What am I missing?{Enter}');
    expect(await screen.findByText(/Hello world/)).toBeInTheDocument();
    expect(screen.getAllByText('Job #1 › Skills').length).toBeGreaterThan(0);
    expect(vi.mocked(streamChat).mock.calls[0][0]).toEqual([{ role: 'user', content: 'What am I missing?' }]);
  });

  it('offers suggested questions that reference the uploaded jobs', () => {
    render(<ChatPanel docs={docs} onOpenDoc={() => {}} />);
    expect(screen.getByRole('button', { name: 'What skills am I missing for Job #1?' })).toBeInTheDocument();
  });

  it('shows an error message when the stream fails', async () => {
    vi.mocked(streamChat).mockRejectedValue(new Error('Too many questions — please wait a minute.'));
    render(<ChatPanel docs={docs} onOpenDoc={() => {}} />);
    await userEvent.type(screen.getByLabelText('Ask a question'), 'hi{Enter}');
    expect(await screen.findByText('Too many questions — please wait a minute.')).toBeInTheDocument();
  });
});
