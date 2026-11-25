import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamChat } from '../api/client';

/** A response body that emits the given SSE text and then NEVER closes (like a keep-alive proxy). */
function neverEndingResponse(sse: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse));
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('streamChat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves on the "done" event even if the connection stays open', async () => {
    const sse =
      'event: token\ndata: {"t":"Hi"}\n\n' +
      'event: sources\ndata: {"sources":[{"label":"Resume","section":"Skills"}],"text":"Hi"}\n\n' +
      'event: done\ndata: {}\n\n';
    vi.stubGlobal('fetch', vi.fn(async () => neverEndingResponse(sse)));
    const tokens: string[] = [];
    let final: unknown;
    const result = streamChat([{ role: 'user', content: 'q' }], { onToken: (t) => tokens.push(t), onDone: (f) => (final = f) });
    await expect(Promise.race([result.then(() => 'resolved'), new Promise((r) => setTimeout(() => r('hung'), 500))])).resolves.toBe('resolved');
    expect(tokens).toEqual(['Hi']);
    expect(final).toEqual({ text: 'Hi', sources: [{ label: 'Resume', section: 'Skills' }] });
  });
});
