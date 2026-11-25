import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { AuthProvider } from '../auth/AuthContext';
import ProtectedRoute from '../auth/ProtectedRoute';
import AdminPage from '../pages/AdminPage';

vi.mock('../api/client', async (orig) => {
  const mod = await orig<typeof import('../api/client')>();
  return { ...mod, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(), upload: vi.fn() } };
});

const usage = {
  totals: { calls: 12, promptTokens: 9000, completionTokens: 1200, costUsd: 0.0123 },
  latency: { p50: 640, p95: 2100 },
  byOp: { chat: { calls: 4, costUsd: 0.01, avgLatencyMs: 1800 }, embed: { calls: 8, costUsd: 0.0003, avgLatencyMs: 300 } },
  byUser: [{ userId: 'u2', email: 'sam@x.com', calls: 12, costUsd: 0.0123 }],
};
const users = [
  { id: 'u1', email: 'admin@x.com', name: 'Admin', role: 'admin', createdAt: '2026-11-01', docCount: 0 },
  { id: 'u2', email: 'sam@x.com', name: 'Sam', role: 'user', createdAt: '2026-11-02', docCount: 4 },
];

function mockGet(me: { role: string }) {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/api/auth/me') return { id: 'u1', email: 'admin@x.com', name: 'Admin', ...me };
    if (path === '/api/admin/users') return users;
    if (path === '/api/admin/usage') return usage;
    throw new Error(`unexpected ${path}`);
  });
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<p>workspace</p>} />
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminPage /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AdminPage', () => {
  beforeEach(() => vi.mocked(api.patch).mockReset());

  it('lists users and shows usage totals', async () => {
    mockGet({ role: 'admin' });
    renderAt('/admin');
    expect(await screen.findByText('sam@x.com', { selector: 'td *, td' })).toBeInTheDocument();
    expect(screen.getByText('$0.0123', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('2100 ms')).toBeInTheDocument();
  });

  it('changing a role calls the API', async () => {
    mockGet({ role: 'admin' });
    vi.mocked(api.patch).mockResolvedValue({ id: 'u2', role: 'admin' });
    renderAt('/admin');
    const row = (await screen.findByText('sam@x.com', { selector: 'td *, td' })).closest('tr')!;
    await userEvent.selectOptions(within(row).getByRole('combobox'), 'admin');
    expect(api.patch).toHaveBeenCalledWith('/api/admin/users/u2/role', { role: 'admin' });
  });

  it('redirects non-admins to the workspace', async () => {
    mockGet({ role: 'user' });
    renderAt('/admin');
    expect(await screen.findByText('workspace')).toBeInTheDocument();
  });
});
