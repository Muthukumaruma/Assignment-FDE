import { GoogleLogin } from '@react-oauth/google';
import { motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Background from '../components/Background';
import FitRing from '../components/FitRing';

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

const DEMO = [
  { label: 'Senior Frontend Engineer', company: 'Acme Analytics', score: 78 },
  { label: 'AI Forward Deployed Engineer', company: 'Nimbus AI', score: 52 },
  { label: 'Full-Stack MERN Developer', company: 'Brightcart', score: 86 },
];

export default function LoginPage() {
  const { user, login, register, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === 'signup' && password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    void run(() => (mode === 'signin' ? login(email, password) : register(name, email, password)));
  }

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <Background />

      <section className="flex flex-col justify-center px-8 py-14 lg:px-20">
        <div className="flex items-center gap-2.5 text-sage">
          <FitRing score={72} size={30} stroke={4} />
          <span className="font-display text-lg font-semibold text-mint">CareerLens</span>
        </div>
        <h1 className="mt-10 max-w-xl text-5xl leading-[1.02] font-bold text-mint lg:text-6xl" style={{ fontVariationSettings: "'wdth' 86", letterSpacing: '-0.025em' }}>
          Know where you stand before the interview.
        </h1>
        <p className="mt-5 max-w-md text-lg text-sage">
          Upload your resume and the jobs you want. CareerLens scores your fit, names the missing skills, and answers
          questions with citations back to the exact line.
        </p>

        <ul className="mt-12 max-w-md space-y-3" aria-label="Example fit scores">
          {DEMO.map((d, i) => (
            <motion.li
              key={d.label}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + i * 0.18, duration: 0.5 }}
              className="panel flex items-center gap-4 px-4 py-3"
            >
              <FitRing score={d.score} delay={0.5 + i * 0.25} />
              <div className="min-w-0">
                <p className="truncate font-medium text-mint">{d.label}</p>
                <p className="text-sm text-sage">{d.company}</p>
              </div>
            </motion.li>
          ))}
        </ul>
      </section>

      <section className="flex items-center justify-center px-6 pb-16 lg:py-14">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="panel w-full max-w-sm p-7 shadow-[0_0_80px_-20px_rgb(16_185_129/0.35)]"
        >
          <div role="tablist" aria-label="Account" className="mb-6 grid grid-cols-2 rounded-xl bg-moss p-1">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`rounded-lg py-2 text-sm font-medium transition ${mode === m ? 'bg-emerald text-night' : 'text-sage hover:text-mint'}`}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === 'signup' && (
              <label className="block">
                <span className="mb-1.5 block text-sm text-sage">Name</span>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm text-sage">Email</span>
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-sage">Password</span>
              <input
                className="field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                aria-describedby={mode === 'signup' ? 'password-hint' : undefined}
              />
            </label>
            {mode === 'signup' && (
              <>
                <p id="password-hint" className="-mt-2.5 text-xs text-sage/80">
                  At least 8 characters.
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-sm text-sage">Confirm password</span>
                  <input
                    className="field"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                    aria-invalid={confirm.length > 0 && confirm !== password}
                    aria-describedby="confirm-hint"
                  />
                </label>
                {confirm.length > 0 && confirm !== password && (
                  <p id="confirm-hint" className="-mt-2.5 text-xs text-rose">
                    Passwords don't match yet.
                  </p>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {GOOGLE_ENABLED && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-sage/70">
                <span className="h-px flex-1 bg-pine" />
                or
                <span className="h-px flex-1 bg-pine" />
              </div>
              <div className="flex justify-center">
                <GoogleLogin
                  theme="filled_black"
                  shape="pill"
                  text={mode === 'signin' ? 'signin_with' : 'signup_with'}
                  onSuccess={(r) => r.credential && void run(() => googleLogin(r.credential!))}
                  onError={() => setError('Google sign-in was cancelled or failed. Try again.')}
                />
              </div>
            </>
          )}
        </motion.div>
      </section>
    </div>
  );
}
