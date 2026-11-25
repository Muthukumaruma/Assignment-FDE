import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { Role } from '../types';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({ role, children }: { role?: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="grid min-h-dvh place-items-center text-sage">Loading your workspace…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}
