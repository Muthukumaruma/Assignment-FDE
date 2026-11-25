import { Menu } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import Background from '../components/Background';
import ChatPanel from '../components/ChatPanel';
import FitDrawer from '../components/FitDrawer';
import MetricsPanel from '../components/MetricsPanel';
import Sidebar from '../components/Sidebar';
import type { Doc } from '../types';

const POLL_MS = 3000;
const POLL_LIMIT_MS = 60_000;

export default function WorkspacePage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [injected, setInjected] = useState<{ question: string; nonce: number }>();
  const [pollUntil, setPollUntil] = useState(0);

  const refresh = useCallback(async () => {
    const list = await api.get<Doc[]>('/api/documents').catch(() => null);
    if (list) setDocs(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Fit analysis runs in the background after an upload; poll until every job has a fresh score.
  const hasResume = docs.some((d) => d.kind === 'resume');
  const waiting = hasResume && docs.some((d) => d.kind === 'job' && (!d.analysis || d.analysisStale));
  useEffect(() => {
    if (!waiting || Date.now() > pollUntil) return;
    const t = setTimeout(() => void refresh(), POLL_MS);
    return () => clearTimeout(t);
  }, [waiting, docs, pollUntil, refresh]);

  const changed = useCallback(() => {
    setPollUntil(Date.now() + POLL_LIMIT_MS);
    void refresh();
  }, [refresh]);

  async function loadSample() {
    setSampleBusy(true);
    await api.post('/api/documents/sample').catch(() => undefined);
    setSampleBusy(false);
    changed();
  }

  async function remove(doc: Doc) {
    if (openId === doc.id) setOpenId(null);
    setDocs((ds) => ds.filter((d) => d.id !== doc.id));
    await api.del(`/api/documents/${doc.id}`).catch(() => undefined);
    void refresh();
  }

  const openDoc = docs.find((d) => d.id === openId) ?? null;

  return (
    <div className="relative grid h-dvh grid-cols-1 lg:grid-cols-[320px_1fr]">
      <Background />
      <div className={`fixed inset-y-0 left-0 z-20 h-dvh w-[320px] transition-transform lg:static lg:min-h-0 lg:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          docs={docs}
          loading={loading}
          onOpen={(d) => {
            setOpenId(d.id);
            setNavOpen(false);
          }}
          onDelete={(d) => void remove(d)}
          onChanged={changed}
          onLoadSample={() => void loadSample()}
          sampleBusy={sampleBusy}
        />
      </div>

      <main className="flex min-h-0 flex-col">
        <header className="flex items-center justify-between px-5 py-3 sm:px-10">
          <button type="button" className="btn-ghost p-2 lg:hidden" onClick={() => setNavOpen((o) => !o)} aria-label="Toggle documents">
            <Menu size={18} />
          </button>
          <span className="hidden text-sm text-sage lg:block">
            {docs.filter((d) => d.kind === 'job').length} jobs compared against {hasResume ? 'your resume' : 'no resume yet'}
          </span>
          <MetricsPanel />
        </header>
        <div className="min-h-0 flex-1">
          <ChatPanel docs={docs} injected={injected} onOpenDoc={(label) => setOpenId(docs.find((d) => d.label === label)?.id ?? null)} />
        </div>
      </main>

      <FitDrawer
        doc={openDoc}
        hasResume={hasResume}
        jobs={docs.filter((d) => d.kind === 'job')}
        onClose={() => setOpenId(null)}
        onChanged={changed}
        onAsk={(question) => {
          setOpenId(null);
          setInjected({ question, nonce: Date.now() });
        }}
      />
    </div>
  );
}
