import { motion } from 'framer-motion';

export function ringColor(score: number): string {
  if (score >= 75) return 'var(--color-lime)';
  if (score >= 55) return 'var(--color-emerald)';
  if (score >= 40) return 'var(--color-amber)';
  return 'var(--color-rose)';
}

interface Props {
  score?: number;
  size?: number;
  stroke?: number;
  /** Seconds before the fill animation starts, so several rings can fill in sequence. */
  delay?: number;
  pending?: boolean;
}

/** The signature element: an animated arc showing how well the resume fits a job. */
export default function FitRing({ score, size = 44, stroke = 5, delay = 0, pending = false }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const has = typeof score === 'number';
  const color = has ? ringColor(score) : 'var(--color-pine)';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={has ? `Fit score ${score}%` : 'Fit score pending'}>
      <svg width={size} height={size} className={pending ? 'animate-spin [animation-duration:2.5s]' : undefined}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-pine)" strokeWidth={stroke} />
        {has ? (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - score / 100) }}
            transition={{ duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        ) : pending ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-emerald)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * 0.2} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        ) : null}
      </svg>
      <span
        className="absolute inset-0 grid place-items-center font-display font-bold tabular-nums"
        style={{ fontSize: size * 0.27, color: has ? color : 'var(--color-sage)' }}
      >
        {size < 36 ? '' : has ? `${score}%` : pending ? '' : '–'}
      </span>
    </div>
  );
}
