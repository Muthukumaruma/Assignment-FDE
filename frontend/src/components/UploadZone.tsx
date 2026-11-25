import { motion } from 'framer-motion';
import { ClipboardPaste, Upload, X } from 'lucide-react';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Doc } from '../types';

interface Props {
  kind: 'resume' | 'job';
  onDone: () => void;
  onCancel: () => void;
}

/** Inline panel for adding one document of a fixed kind: pick/drop a file, or paste its text. */
export default function UploadZone({ kind, onDone, onCancel }: Props) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState({ title: '', company: '', text: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const isJob = kind === 'job';

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
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
    void run(() => api.post('/api/documents', { kind, ...paste }));
  }

  return (
    <motion.section
      aria-label={isJob ? 'Add a job description' : 'Upload your resume'}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-2 space-y-2 rounded-xl border border-emerald/40 bg-moss/70 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-mint">{isJob ? 'Add a job description' : 'Upload your resume'}</p>
          <button type="button" onClick={onCancel} aria-label="Cancel" className="rounded-md p-1 text-sage hover:text-mint">
            <X size={14} />
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-lg border border-dashed p-4 text-center transition ${dragging ? 'border-lime bg-lime/5' : 'border-pine'}`}
        >
          <input
            ref={fileRef}
            type="file"
            aria-label="Choose a file"
            accept=".pdf,.docx,.txt,.md"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="btn-primary w-full py-2 text-sm"
          >
            <Upload size={15} />
            {busy ? 'Reading and indexing…' : 'Choose PDF, DOCX or TXT'}
          </button>
          <p className="mt-2 text-xs text-sage/80">or drop the file here, up to 5 MB</p>
        </div>

        {!pasteOpen ? (
          <button type="button" onClick={() => setPasteOpen(true)} className="inline-flex items-center gap-1.5 text-xs text-sage hover:text-mint">
            <ClipboardPaste size={13} /> Paste text instead
          </button>
        ) : (
          <form onSubmit={onPaste} className="space-y-2">
            <input className="field py-2 text-sm" placeholder={isJob ? 'Job title (optional)' : 'Your name (optional)'} value={paste.title} onChange={(e) => setPaste({ ...paste, title: e.target.value })} />
            {isJob && (
              <input className="field py-2 text-sm" placeholder="Company (optional)" value={paste.company} onChange={(e) => setPaste({ ...paste, company: e.target.value })} />
            )}
            <textarea
              className="field h-32 resize-y text-sm"
              placeholder={isJob ? 'Paste the job description' : 'Paste your resume'}
              value={paste.text}
              onChange={(e) => setPaste({ ...paste, text: e.target.value })}
              required
            />
            <button type="submit" disabled={busy} className="btn-primary w-full py-2 text-sm">
              {isJob ? 'Add job' : 'Save resume'}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-rose/30 bg-rose/10 px-2.5 py-1.5 text-xs text-rose">
            {error}
          </p>
        )}
      </div>
    </motion.section>
  );
}
