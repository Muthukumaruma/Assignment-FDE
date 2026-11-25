import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';

const CITATION = /\[((?:Resume|Job #\d{1,3}))\s{0,2}(?:›|>)\s{0,2}([^\]\n]{1,60})\]/g;

/** Turns "[Job #2 › Requirements]" into a markdown link with a cite: URL, rendered as a pill below. */
function linkCitations(text: string): string {
  return text.replace(CITATION, (_m, label: string, section: string) => `[${label} › ${section.trim()}](cite:${encodeURIComponent(label)})`);
}

export function CitationPill({ label, section, onClick }: { label: string; section: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Open ${label}`}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center rounded-md border border-emerald/40 bg-emerald/10 px-1.5 py-px align-middle text-[12px] font-medium whitespace-nowrap text-emerald transition hover:border-lime hover:text-lime"
    >
      {label} › {section}
    </button>
  );
}

interface Props {
  message: ChatMessage;
  onOpenDoc: (label: string) => void;
}

export default function Message({ message, onOpenDoc }: Props) {
  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <p className="max-w-[80%] rounded-2xl rounded-br-md bg-emerald px-4 py-2.5 font-medium whitespace-pre-wrap text-night">
          {message.content}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-[92%]">
      <div className="prose-chat text-mint">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => url}
          components={{
            a: ({ href, children }) => {
              if (href?.startsWith('cite:')) {
                const label = decodeURIComponent(href.slice(5));
                const text = String(Array.isArray(children) ? children.join('') : children);
                const section = text.split('›')[1]?.trim() ?? '';
                return <CitationPill label={label} section={section} onClick={() => onOpenDoc(label)} />;
              }
              return (
                <a href={href} target="_blank" rel="noreferrer" className="text-lime underline">
                  {children}
                </a>
              );
            },
          }}
        >
          {linkCitations(message.content)}
        </ReactMarkdown>
        {message.streaming && <span className="ml-0.5 inline-block h-4 w-2 animate-caret bg-lime align-middle" aria-hidden />}
      </div>
      {message.error && (
        <p role="alert" className="mt-2 rounded-lg border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
          {message.error}
        </p>
      )}
      {!!message.sources?.length && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-sage">
          <span>Sources</span>
          {message.sources.map((s) => (
            <CitationPill key={`${s.label}${s.section}`} label={s.label} section={s.section} onClick={() => onOpenDoc(s.label)} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
