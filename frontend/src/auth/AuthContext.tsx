import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Waits between retries of the session check: ~15 s in total covers a redeploy or a free-tier cold start. */
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AuthProvider({ children, retryDelaysMs = DEFAULT_RETRY_DELAYS_MS }: { children: ReactNode; retryDelaysMs?: number[] }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Only a 401 means "signed out". A 5xx or network error means the API is restarting
    // (redeploy, cold start); treating that as signed out would log people out on every deploy.
    (async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const me = await api.get<User>('/api/auth/me');
          if (!cancelled) setUser(me);
          break;
        } catch (err) {
          const signedOut = err instanceof ApiError && err.status === 401;
          if (signedOut || attempt >= retryDelaysMs.length) {
            if (!cancelled) setUser(null);
            break;
          }
          await sleep(retryDelaysMs[attempt]);
          if (cancelled) return;
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [retryDelaysMs]);

  const login = useCallback(async (email: string, password: string) => {
    setUser(await api.post<User>('/api/auth/login', { email, password }));
  }, []);
  const register = useCallback(async (name: string, email: string, password: string) => {
    setUser(await api.post<User>('/api/auth/register', { name, email, password }));
  }, []);
  const googleLogin = useCallback(async (credential: string) => {
    setUser(await api.post<User>('/api/auth/google', { credential }));
  }, []);
  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, googleLogin, logout }), [user, loading, login, register, googleLogin, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
