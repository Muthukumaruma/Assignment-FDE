import { motion } from 'framer-motion';
import { FileText, Trash2 } from 'lucide-react';
import type { Doc } from '../types';
import FitRing from './FitRing';

interface Props {
  doc: Doc;
  index: number;
  hasResume: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

export default function DocCard({ doc, index, hasResume, onOpen, onDelete }: Props) {
  const isJob = doc.kind === 'job';
  const pending = isJob && hasResume && (!doc.analysis || doc.analysisStale);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ delay: index * 0.06 }}
      className="group relative"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-moss/60 px-3 py-2.5 text-left transition hover:border-pine hover:bg-moss"
      >
        {isJob ? (
          <FitRing score={doc.analysisStale ? undefined : doc.analysis?.score} pending={pending} delay={0.2 + index * 0.2} />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-emerald/40 bg-emerald/10 text-emerald">
            <FileText size={18} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-sage">{doc.label}</span>
          <span className="block truncate font-medium text-mint">{doc.title}</span>
          {doc.company && <span className="block truncate text-xs text-sage">{doc.company}</span>}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Remove ${doc.label}`}
        className="absolute top-2 right-2 rounded-md p-1.5 text-sage opacity-0 transition group-hover:opacity-100 hover:bg-rose/10 hover:text-rose focus:opacity-100"
      >
        <Trash2 size={14} />
      </button>
    </motion.li>
  );
}
