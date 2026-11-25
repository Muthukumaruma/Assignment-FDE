import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { AuthProvider, useAuth } from '../auth/AuthContext';

vi.mock('../api/client', async (orig) => {
  const mod = await orig<typeof import('../api/client')>();
  return { ...mod, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(), upload: vi.fn() } };
});

function Probe() {
  const { user, loading } = useAuth();
  return <p>{loading ? 'loading' : user ? `user:${user.email}` : 'signed-out'}</p>;
}

const me = { id: 'u', email: 'me@x.com', name: 'Me', role: 'user' };

describe('AuthProvider session restore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the session through temporary server errors (redeploy / cold start)', async () => {
    let calls = 0;
    vi.mocked(api.get).mockImplementation(async () => {
      calls += 1;
      if (calls <= 2) throw new ApiError(502, 'The API is starting up or unreachable.');
      return me;
    });
    render(<AuthProvider retryDelaysMs={[1, 1, 1]}><Probe /></AuthProvider>);
    expect(await screen.findByText('user:me@x.com')).toBeInTheDocument();
    expect(calls).toBe(3);
  });

  it('signs out immediately on 401 without retrying', async () => {
    vi.mocked(api.get).mockImplementation(async () => {
      throw new ApiError(401, 'Not signed in');
    });
    render(<AuthProvider retryDelaysMs={[1, 1, 1]}><Probe /></AuthProvider>);
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retries are exhausted', async () => {
    vi.mocked(api.get).mockImplementation(async () => {
      throw new ApiError(503, 'down');
    });
    render(<AuthProvider retryDelaysMs={[1, 1]}><Probe /></AuthProvider>);
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(3);
  });
});
