import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client';
import { AuthProvider } from '../auth/AuthContext';
import LoginPage from '../pages/LoginPage';

vi.mock('../api/client', async (orig) => {
  const mod = await orig<typeof import('../api/client')>();
  return { ...mod, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn(), upload: vi.fn() } };
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(401, 'Not signed in'));
  });

  it('shows the sign-in form by default', async () => {
    renderLogin();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('switching to "Create account" shows the name field', async () => {
    renderLogin();
    await userEvent.click(await screen.findByRole('tab', { name: 'Create account' }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('shows the server error when sign-in fails', async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(401, 'Invalid email or password'));
    renderLogin();
    await userEvent.type(await screen.findByLabelText('Email'), 'a@x.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
