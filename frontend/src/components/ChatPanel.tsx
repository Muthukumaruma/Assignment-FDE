import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { streamChat } from '../api/client';
import type { ChatMessage, Doc } from '../types';
import Message from './Message';

interface Props {
  docs: Doc[];
  onOpenDoc: (label: string) => void;
  /** A question asked from elsewhere (e.g. the fit drawer). A new nonce triggers it. */
  injected?: { question: string; nonce: number };
}

const newId = () => Math.random().toString(36).slice(2);

function suggestionsFor(docs: Doc[]): string[] {
  const jobs = docs.filter((d) => d.kind === 'job');
  if (jobs.length === 0) return ['What are the strongest points of my resume?', 'How should I describe my experience in an interview?'];
  const [a, b = a, c = b] = jobs.map((j) => j.label);
  return [
    `What skills am I missing for ${a}?`,
    `How does my experience align with ${b}?`,
    jobs.length > 1 ? 'Which job am I the best fit for?' : `What should I learn first for ${a}?`,
    `Prepare me for the ${c} interview`,
  ];
}

export default function ChatPanel({ docs, onOpenDoc, injected }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => suggestionsFor(docs), [docs]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const patchLast = (patch: (m: ChatMessage) => ChatMessage) =>
    setMessages((ms) => ms.map((m, i) => (i === ms.length - 1 ? patch(m) : m)));

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = [...messages.filter((m) => !m.error), { id: newId(), role: 'user' as const, content: q }];
    setMessages([...history, { id: newId(), role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamChat(
        history.map(({ role, content }) => ({ role, content })),
        {
          signal: controller.signal,
          onToken: (t) => patchLast((m) => ({ ...m, content: m.content + t })),
          // The server's final text has invented citations removed; prefer it over the streamed draft.
          onDone: ({ text, sources }) => patchLast((m) => ({ ...m, content: text || m.content, sources })),
        },
      );
    } catch (err) {
      if (!controller.signal.aborted) {
        patchLast((m) => ({ ...m, error: err instanceof Error ? err.message : 'Something went wrong' }));
      }
    } finally {
      patchLast((m) => ({ ...m, streaming: false }));
      setBusy(false);
    }
  }

  useEffect(() => {
    if (injected) void ask(injected.question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected?.nonce]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Chat">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-10">
        <div className="mx-auto max-w-3xl space-y-7">
          {messages.length === 0 ? (
            <div className="pt-[8vh]">
              <h2 className="text-3xl font-bold text-mint">Ask anything about your fit.</h2>
              <p className="mt-2 max-w-lg text-sage">
                Answers come only from your resume and the jobs you added, and every claim links back to its source.
              </p>
            </div>
          ) : (
            messages.map((m) => <Message key={m.id} message={m} onOpenDoc={onOpenDoc} />)
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="px-5 pb-5 sm:px-10">
        <div className="mx-auto max-w-3xl">
          <AnimatePresence>
            {messages.length === 0 && (
              <motion.div exit={{ opacity: 0, y: 6 }} className="mb-3 flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <motion.button
                    key={s}
                    type="button"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i }}
                    onClick={() => void ask(s)}
                    className="rounded-full border border-pine bg-moss/70 px-3.5 py-1.5 text-sm text-sage transition hover:border-emerald hover:text-mint"
                  >
                    {s}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          <form
            onSubmit={onSubmit}
            className="flex items-end gap-2 rounded-2xl border border-pine bg-moss/80 p-2 shadow-[0_0_40px_-12px_rgb(16_185_129/0.45)] backdrop-blur-xl focus-within:border-emerald"
          >
            <textarea
              aria-label="Ask a question"
              rows={1}
              value={input}
              maxLength={2000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about fit, gaps or interview prep"
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-mint placeholder:text-sage/60 focus:outline-none"
            />
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()} className="btn-ghost h-10 w-10 p-0" aria-label="Stop answering">
                <Square size={16} />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="btn-primary h-10 w-10 p-0" aria-label="Send">
                <ArrowUp size={18} />
              </button>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
