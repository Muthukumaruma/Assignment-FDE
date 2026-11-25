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
    vi.clearAllMocks();
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

  it('asks to confirm the password only when creating an account', async () => {
    renderLogin();
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Create account' }));
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument();
  });

  it('blocks sign-up when the passwords do not match, without calling the API', async () => {
    renderLogin();
    await userEvent.click(await screen.findByRole('tab', { name: 'Create account' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Me');
    await userEvent.type(screen.getByLabelText('Email'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password124');
    await userEvent.click(screen.getAllByRole('button', { name: 'Create account' }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent("Passwords don't match");
    expect(api.post).not.toHaveBeenCalled();
  });

  it('creates the account when the passwords match', async () => {
    vi.mocked(api.post).mockResolvedValue({ id: 'u', email: 'me@x.com', name: 'Me', role: 'user' });
    renderLogin();
    await userEvent.click(await screen.findByRole('tab', { name: 'Create account' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Me');
    await userEvent.type(screen.getByLabelText('Email'), 'me@x.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123');
    await userEvent.click(screen.getAllByRole('button', { name: 'Create account' }).at(-1)!);
    expect(api.post).toHaveBeenCalledWith('/api/auth/register', { name: 'Me', email: 'me@x.com', password: 'password123' });
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
