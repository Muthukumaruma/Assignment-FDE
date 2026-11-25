import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardPaste, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Doc } from '../types';

interface Props {
  hasResume: boolean;
  onAdded: () => void;
}

export default function UploadZone({ hasResume, onAdded }: Props) {
  const [kind, setKind] = useState<'resume' | 'job'>(hasResume ? 'job' : 'resume');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState({ title: '', company: '', text: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  // Documents load after mount: once a resume exists, the likely next upload is a job.
  useEffect(() => {
    if (hasResume) setKind('job');
  }, [hasResume]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onAdded();
      if (kind === 'resume') setKind('job');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  function uploadFile(file: File) {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', file);
    void run(() => api.upload<Doc>('/api/documents', form));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function onPaste(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api.post('/api/documents', { kind, ...paste });
      setPaste({ title: '', company: '', text: '' });
      setPasteOpen(false);
    });
  }

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Document type" className="grid grid-cols-2 rounded-lg bg-moss p-0.5 text-xs">
        {(['resume', 'job'] as const).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-md py-1.5 font-medium transition ${kind === k ? 'bg-pine text-mint' : 'text-sage hover:text-mint'}`}
          >
            {k === 'resume' ? (hasResume ? 'Replace resume' : 'Resume') : 'Job description'}
          </button>
        ))}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border border-dashed p-4 text-center transition ${dragging ? 'border-lime bg-lime/5' : 'border-pine'}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadFile(f);
            e.target.value = '';
          }}
        />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 text-sm font-medium text-emerald hover:text-lime disabled:opacity-50">
          <Upload size={15} />
          {busy ? 'Reading and indexing…' : 'Upload PDF, DOCX or TXT'}
        </button>
        <p className="mt-1 text-xs text-sage/80">or drop a file here, up to 5 MB</p>
        <button type="button" onClick={() => setPasteOpen((o) => !o)} className="mt-2 inline-flex items-center gap-1.5 text-xs text-sage hover:text-mint">
          <ClipboardPaste size={13} /> Paste text instead
        </button>
      </div>

      <AnimatePresence>
        {pasteOpen && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={onPaste}
            className="space-y-2 overflow-hidden"
          >
            <input className="field py-2 text-sm" placeholder="Title (optional)" value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} />
            {kind === 'job' && (
              <input className="field py-2 text-sm" placeholder="Company (optional)" value={paste.company} onChange={(e) => setPaste({ ...paste, company: e.target.value })} />
            )}
            <textarea
              className="field h-32 resize-y text-sm"
              placeholder={kind === 'job' ? 'Paste the job description' : 'Paste your resume'}
              value={paste.text}
              onChange={(e) => setPaste({ ...paste, text: e.target.value })}
              required
            />
            <button type="submit" disabled={busy} className="btn-primary w-full py-2 text-sm">
              {kind === 'job' ? 'Add job' : 'Save resume'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {error && (
        <p role="alert" className="text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}
