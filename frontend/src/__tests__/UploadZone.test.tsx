import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { AuthProvider } from '../auth/AuthContext';
import Sidebar from '../components/Sidebar';
import UploadZone from '../components/UploadZone';
import type { Doc } from '../types';

vi.mock('../api/client', async (orig) => {
  const mod = await orig<typeof import('../api/client')>();
  return { ...mod, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(), upload: vi.fn() } };
});

const resume: Doc = { id: 'r', kind: 'resume', label: 'Resume', title: 'Alex', analysisStale: false, createdAt: '' };

function renderSidebar(docs: Doc[]) {
  vi.mocked(api.get).mockResolvedValue({ id: 'u', email: 'u@x.com', name: 'U', role: 'user' });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Sidebar docs={docs} loading={false} onOpen={() => {}} onDelete={() => {}} onChanged={() => {}} onLoadSample={() => {}} sampleBusy={false} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('adding documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an "Upload resume" button when there is no resume, and "Add job" always', () => {
    renderSidebar([]);
    expect(screen.getByRole('button', { name: 'Upload resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add job' })).toBeInTheDocument();
  });

  it('offers "Replace resume" once a resume exists', () => {
    renderSidebar([resume]);
    expect(screen.getByRole('button', { name: 'Replace resume' })).toBeInTheDocument();
  });

  it('clicking "Add job" opens an upload panel for a job description', async () => {
    renderSidebar([resume]);
    await userEvent.click(screen.getByRole('button', { name: 'Add job' }));
    expect(screen.getByRole('region', { name: 'Add a job description' })).toBeInTheDocument();
  });

  it('uploads the chosen file with the panel kind', async () => {
    vi.mocked(api.upload).mockResolvedValue({});
    const onDone = vi.fn();
    render(<UploadZone kind="job" onDone={onDone} onCancel={() => {}} />);
    const file = new File(['Data Engineer'], 'jd.txt', { type: 'text/plain' });
    await userEvent.upload(screen.getByLabelText('Choose a file'), file);
    const form = vi.mocked(api.upload).mock.calls[0][1] as FormData;
    expect(form.get('kind')).toBe('job');
    expect(onDone).toHaveBeenCalled();
  });

  it('shows the server error when an upload fails', async () => {
    vi.mocked(api.upload).mockImplementation(async () => { throw new ApiError(422, 'No extractable text. If this is a scanned PDF, export it as a text PDF or use "Paste text".'); });
    render(<UploadZone kind="resume" onDone={() => {}} onCancel={() => {}} />);
    await userEvent.upload(screen.getByLabelText('Choose a file'), new File(['x'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('scanned PDF');
  });
});
