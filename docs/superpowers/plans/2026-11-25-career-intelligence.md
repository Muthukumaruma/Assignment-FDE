# CareerLens AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A MERN (TypeScript) Career Intelligence Assistant: users sign in (email/password or Google), upload a resume + job descriptions, get per-job fit analysis and grounded, cited, streaming chat answers via RAG over MongoDB Atlas Vector Search.

**Architecture:** `backend/` Express API built by `createApp(deps)` with injected `LlmClient`, `Retriever`, `GoogleVerifier` so tests mock all I/O except Mongo (mongodb-memory-server). Hand-written RAG: parse → section chunk → embed → store → route → `$vectorSearch` (userId-filtered) → prompt → SSE stream → citation filter. `frontend/` React + Vite + Tailwind v4 + Framer Motion, "Midnight Emerald" theme, nginx in Docker proxies `/api` to backend.

**Tech Stack:** Node 20, TypeScript (strict), Express 4, Mongoose 8, zod, pino/pino-http, openai SDK v4, google-auth-library, bcryptjs, jsonwebtoken, cookie-parser, multer, pdf-parse, mammoth, express-rate-limit, helmet; Vitest, supertest, mongodb-memory-server; React 19, Vite, Tailwind v4, framer-motion, react-router v7, @react-oauth/google, lucide-react, @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-11-25-career-intelligence-design.md`

## Global Constraints

- Database name: `career_intelligence` (set via `MONGODB_DB`); never read/write other DBs. `MONGODB_URI` only in `backend/.env` (gitignored); commit `backend/.env.example` with placeholders.
- `OPENAI_CHAT_MODEL` default `gpt-4o-mini`; `OPENAI_EMBED_MODEL` default `text-embedding-3-small`; embedding dims `1536`.
- Vector index name `chunk_vector_idx` on `chunks.embedding`, cosine, filter fields `userId`, `docId`, `kind`.
- JWT: HS256, `JWT_SECRET`, 7d expiry, httpOnly cookie named `cl_session`, SameSite=Lax, `secure` in production.
- Roles exactly `user` | `admin`; `ADMIN_EMAIL` account gets `admin` on register/login/google.
- Every data query and vector search scoped by `userId`.
- Uploads: PDF/DOCX/TXT only, max 5 MB; chat question max 2000 chars.
- Chunk cap ~800 tokens (≈3200 chars), overlap ~100 tokens (≈400 chars); context budget ≈6000 tokens (≈24000 chars); last 6 chat turns kept.
- Citation format in answers: `[Job #2 › Requirements]`, `[Resume › Skills]`.
- Theme tokens: bg `#05110d`, panel `#071a14`, card `#0b231b`, border `#14422f`, primary `#10b981`, accent `#a3e635`, text `#d1fae5`, danger chip `#3f1d1d`/`#fca5a5`.
- No LangChain/LlamaIndex.

## Review Focus

- Scanned/image-only PDF yields empty text → ingestion must reject with 422 "No extractable text" rather than store an empty doc (test in Task 6).
- Asking about "Job #5" when only 3 jobs exist → answer must say that job isn't uploaded, not silently search everything (test in Task 8).
- Chat with no resume uploaded → still answers about jobs and notes the resume is missing (test in Task 9).
- User B must never retrieve user A's chunks, including via `DELETE /api/documents/:id` with A's id → 404 (test in Task 6).
- Google login for an email already registered with password → links account instead of creating a duplicate (test in Task 3).

---

## File Structure

```
backend/
  src/
    config/env.ts            zod-validated env
    lib/logger.ts            pino instance
    lib/errors.ts            HttpError + errorHandler
    db/connect.ts            mongoose connect to MONGODB_DB
    db/vectorIndex.ts        ensureVectorIndex()
    models/{User,Document,Chunk,LlmTrace}.ts
    auth/{jwt.ts,middleware.ts,google.ts,routes.ts}
    llm/{client.ts,pricing.ts}
    ingest/{extract.ts,chunker.ts,service.ts}
    rag/{router.ts,retriever.ts,context.ts,prompt.ts,guard.ts,citations.ts}
    analysis/service.ts
    routes/{documents.ts,chat.ts,admin.ts,health.ts}
    app.ts                   createApp(deps)
    server.ts                wires real deps, listens
  test/helpers.ts            memory mongo, fake deps, login helper
  test/*.test.ts
  eval/{golden.json,run.ts}
  sample-data/{resume.txt,job1.txt,job2.txt,job3.txt}
  Dockerfile
frontend/
  src/
    theme.css                tailwind v4 @theme tokens + keyframes
    api/client.ts            fetch wrapper, streamChat()
    auth/AuthContext.tsx, ProtectedRoute.tsx
    pages/{LoginPage,WorkspacePage,AdminPage}.tsx
    components/{Background,Sidebar,DocCard,FitRing,UploadZone,ChatPanel,Message,CitationPill,SkillChips,SuggestionChips,FitDrawer,MetricsPanel}.tsx
    App.tsx, main.tsx
  nginx.conf, Dockerfile
docker-compose.yml
README.md
```

---

### Task 1: Backend skeleton (env, logging, errors, health)

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/.env.example`, `backend/src/config/env.ts`, `backend/src/lib/logger.ts`, `backend/src/lib/errors.ts`, `backend/src/routes/health.ts`, `backend/src/app.ts`, `backend/src/server.ts`
- Test: `backend/test/health.test.ts`

**Interfaces:**
- Produces: `env` (typed object: `PORT, MONGODB_URI, MONGODB_DB, OPENAI_API_KEY, OPENAI_CHAT_MODEL, OPENAI_EMBED_MODEL, JWT_SECRET, GOOGLE_CLIENT_ID, ADMIN_EMAIL, CORS_ORIGIN, NODE_ENV`); `class HttpError(status: number, message: string)`; `errorHandler` middleware; `interface AppDeps { llm: LlmClient; retriever: Retriever; google: GoogleVerifier }`; `createApp(deps: AppDeps): Express`. Every response carries `x-request-id`.
- Scripts: `dev` (tsx watch), `build` (tsc), `start`, `test` (vitest run), `lint`, `eval`.

- [ ] **Step 1: Write failing test** — `GET /api/health` → 200 `{ status: "ok" }` and header `x-request-id` present; unknown route → 404 JSON `{ error: "Not found" }`.
- [ ] **Step 2: Run** `cd backend && npm test` → FAIL (createApp missing).
- [ ] **Step 3: Implement** app with helmet, cors (credentials, `CORS_ORIGIN`), cookie-parser, json limit 1mb, pino-http (genReqId uuid, sets header), health route, 404, `errorHandler` (HttpError → its status; zod error → 400; else 500 "Internal error", logged).
- [ ] **Step 4: Run** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(backend): express skeleton with env, logging, health`.

### Task 2: Mongo models + test helpers

**Files:**
- Create: `backend/src/db/connect.ts`, `backend/src/db/vectorIndex.ts`, `backend/src/models/User.ts`, `Document.ts`, `Chunk.ts`, `LlmTrace.ts`, `backend/test/helpers.ts`
- Test: `backend/test/models.test.ts`

**Interfaces:**
- Produces:
  - `User { email (unique, lowercase), name, passwordHash?, googleId?, avatarUrl?, role: 'user'|'admin', createdAt }`
  - `DocumentModel { userId, kind: 'resume'|'job', label: string ("Resume" | "Job #N"), title, company?, rawText, analysis?: FitAnalysis, analysisStale: boolean, createdAt }`
  - `Chunk { userId, docId, kind, label, section, text, order, embedding: number[] }` (index on `{userId, docId}`)
  - `LlmTrace { userId?, requestId, op: 'embed'|'chat'|'analyze'|'guard', model, promptTokens, completionTokens, latencyMs, costUsd, createdAt }`
  - `connectDb(uri: string, dbName: string): Promise<void>`; `ensureVectorIndex(): Promise<void>` (uses `collection.listSearchIndexes` / `createSearchIndex` type `vectorSearch`; logs and continues if unsupported).
  - helpers: `startMemoryDb()`, `stopMemoryDb()`, `fakeDeps(overrides?)`, `registerAndLogin(app, email, role?) → agent`.
- [ ] **Step 1: Failing test** — User email unique (second insert rejects); Document label/kind required.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(backend): mongoose models and test helpers`.

### Task 3: Auth — email/password, Google, JWT, RBAC

**Files:**
- Create: `backend/src/auth/jwt.ts`, `middleware.ts`, `google.ts`, `routes.ts`
- Test: `backend/test/auth.test.ts`

**Interfaces:**
- Produces: `signSession(user) → string`, `verifySession(token) → {id, role}`; `requireAuth` (sets `req.user = {id, email, role}`; 401 otherwise); `requireRole('admin')` (403); `interface GoogleVerifier { verify(credential: string): Promise<{ sub: string; email: string; name: string; picture?: string; emailVerified: boolean }> }`; `createGoogleVerifier(clientId)` via `OAuth2Client.verifyIdToken`.
- Routes: `POST /api/auth/register {email, password(min 8), name}` → 201 user; `POST /api/auth/login` → 200; `POST /api/auth/google {credential}` → 200; `POST /api/auth/logout` → clears cookie; `GET /api/auth/me` → `{id,email,name,role,avatarUrl}`. All set `cl_session` cookie. Login/register rate-limited (20/15min).
- [ ] **Step 1: Failing tests:**
  - register → 201, `set-cookie` contains `cl_session`, `/me` returns user, role `user`; response never includes `passwordHash`.
  - register with `ADMIN_EMAIL` → role `admin`.
  - login wrong password → 401 `{error:"Invalid email or password"}`; duplicate register → 409.
  - google with fake verifier → creates user with googleId; google for email already registered by password → same `_id`, googleId set (Review Focus).
  - google with `emailVerified:false` → 401.
  - `/me` without cookie → 401; a `user` calling an admin-guarded test route → 403.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (bcryptjs cost 10). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(auth): email/password + Google sign-in with JWT cookie and RBAC`.

### Task 4: Text extraction + section-aware chunker

**Files:**
- Create: `backend/src/ingest/extract.ts`, `backend/src/ingest/chunker.ts`
- Test: `backend/test/chunker.test.ts`, `backend/test/extract.test.ts`

**Interfaces:**
- Produces: `extractText(buf: Buffer, mime: string, filename: string): Promise<string>` (pdf-parse / mammoth / utf8; throws `HttpError(415)` for other types); `normalize(text) → string` (collapse whitespace, strip bullets noise); `chunkDocument(text: string, opts?: {maxChars=3200, overlap=400}) → { section: string; text: string; order: number }[]`.
- Heading detection: a line ≤ 40 chars that matches (case-insensitive, optional trailing colon) one of: summary, profile, objective, skills, technical skills, experience, work experience, employment, projects, education, certifications, responsibilities, requirements, qualifications, what you'll do, what we're looking for, nice to have, preferred, benefits, about us, about the role — OR is ALL CAPS ≤ 5 words. Text before first heading → section `General`. Long sections split on paragraph boundaries with overlap.
- [ ] **Step 1: Failing tests:**
  - resume text with `SKILLS`, `Experience:` headings → chunks with sections `Skills`, `Experience` (title-cased) in order.
  - text with no headings → one `General` chunk.
  - 10 000-char section → multiple chunks each ≤ 3200 chars, consecutive chunks share ≥ 1 overlapping sentence.
  - extract TXT buffer → string; `image/png` → throws status 415.
- [ ] **Step 2–4:** run FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(ingest): text extraction and section-aware chunker`.

### Task 5: LLM client with tracing + pricing

**Files:**
- Create: `backend/src/llm/client.ts`, `backend/src/llm/pricing.ts`
- Test: `backend/test/llm.test.ts`

**Interfaces:**
- Produces:
```ts
interface LlmCtx { userId?: string; requestId: string }
interface LlmClient {
  embed(texts: string[], ctx: LlmCtx): Promise<number[][]>;
  chatStream(messages: ChatMsg[], ctx: LlmCtx): AsyncIterable<string>;
  complete(messages: ChatMsg[], ctx: LlmCtx, op: 'guard'|'chat'): Promise<string>;
  structured<T>(messages: ChatMsg[], schema: ZodType<T>, name: string, ctx: LlmCtx): Promise<T>;
}
type ChatMsg = { role: 'system'|'user'|'assistant'; content: string };
```
  `createOpenAiClient(apiKey)` implements it; every call writes an `LlmTrace` (stream uses `stream_options.include_usage`). `costUsd(model, promptTokens, completionTokens)` from a price table (gpt-4o-mini 0.15/0.60 per 1M; text-embedding-3-small 0.02 per 1M; unknown model → 0). `structured` uses `response_format: json_schema` via `zodResponseFormat` and validates. Embed batches of 100.
- [ ] **Step 1: Failing tests** — `costUsd('gpt-4o-mini', 1_000_000, 1_000_000) === 0.75`; `recordTrace` persists a doc with given fields (test against memory db).
- [ ] **Step 2–4:** FAIL → implement → PASS (OpenAI SDK itself not called in tests).
- [ ] **Step 5: Commit** `feat(llm): OpenAI client wrapper with token/cost tracing`.

### Task 6: Ingestion service + documents API

**Files:**
- Create: `backend/src/ingest/service.ts`, `backend/src/routes/documents.ts`
- Test: `backend/test/documents.test.ts`

**Interfaces:**
- Consumes: `extractText`, `chunkDocument`, `LlmClient.embed`, models, `requireAuth`.
- Produces: `ingestDocument(input: { userId; kind; title; company?; text }, deps, ctx) → DocumentModel`. Labels: resume → `Resume`; job → `Job #N` where N = max existing job number for user + 1. New resume deletes previous resume + its chunks and marks all jobs `analysisStale=true`.
- Routes (all `requireAuth`): `POST /api/documents` (multer memory, field `file`, or JSON `{kind,title,company?,text}`) → 201 doc (without rawText); `GET /api/documents` → list sorted resume first then job number; `DELETE /api/documents/:id` → 204 (deletes chunks); `POST /api/documents/sample` → loads `sample-data/` (resume + 3 jobs) for current user.
- After a job is ingested (or resume replaced), fire-and-forget `analyzeJob` (Task 10) — wire via optional hook `onIngested` so this task doesn't depend on Task 10.
- [ ] **Step 1: Failing tests:**
  - paste job text → 201, label `Job #1`; second → `Job #2`; chunks stored with `userId` and embeddings length from fake embed.
  - second resume replaces first (only one resume in list).
  - empty/whitespace text → 422 `{error:"No extractable text"}` (Review Focus).
  - file > 5 MB → 413; `.png` → 415.
  - user B deleting user A's doc → 404, A's doc still exists (Review Focus).
  - unauthenticated → 401.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(documents): upload/paste ingestion with per-user isolation`.

### Task 7: Retriever (Atlas `$vectorSearch`) + job-ref router + context builder

**Files:**
- Create: `backend/src/rag/router.ts`, `backend/src/rag/retriever.ts`, `backend/src/rag/context.ts`
- Test: `backend/test/router.test.ts`, `backend/test/context.test.ts`

**Interfaces:**
- Produces:
  - `resolveTargets(question: string, docs: {id,label,title,company?,kind}[]) → { jobIds: string[]; missingRefs: string[] }` — matches numeric forms only (`job #2`, `job 2`, `#2`), and case-insensitive title/company substring (≥ 4 chars).
  - `interface Retriever { search(q: { userId: string; embedding: number[]; docIds?: string[]; limit: number }): Promise<RetrievedChunk[]> }`; `RetrievedChunk = { docId, label, section, text, score }`; `createAtlasRetriever()` runs `$vectorSearch` (index `chunk_vector_idx`, `numCandidates = limit*10`, filter `{ userId, docId: {$in} }`).
  - `retrieveContext(question, userId, docs, deps, ctx) → { chunks: RetrievedChunk[]; missingRefs: string[]; fullText: boolean }` — if total rawText of user ≤ 24000 chars use all chunks (fullText=true); else targeted: per target doc top 4 + resume top 4; untargeted: top 8 then ensure ≥ 2 resume chunks.
  - `buildContextBlock(chunks) → string` — `<document label="Job #2" section="Requirements">…</document>` blocks, truncated to 24000 chars.
- [ ] **Step 1: Failing tests:**
  - `resolveTargets("gaps for Job #2", docs)` → jobIds = [job2.id]; `"compare #1 and #3"` → both; `"Acme role?"` with company Acme → that job; `"Job #5"` with 3 jobs → `missingRefs:["Job #5"]` (Review Focus).
  - `buildContextBlock` escapes `<`/`>` inside text, output ≤ 24000 chars.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(rag): job reference routing, vector retriever, context builder`.

### Task 8: Guard, prompt, citations

**Files:**
- Create: `backend/src/rag/guard.ts`, `backend/src/rag/prompt.ts`, `backend/src/rag/citations.ts`
- Test: `backend/test/guard.test.ts`, `backend/test/prompt.test.ts`, `backend/test/citations.test.ts`

**Interfaces:**
- Produces:
  - `checkInput(question) → { ok: true } | { ok: false; reason: 'too_long'|'empty' }`
  - `classifyTopic(question, llm, ctx) → Promise<'on_topic'|'off_topic'>` — `llm.complete` with a short classifier prompt answering one word; anything not `off_topic` → `on_topic` (fail-open, logged).
  - `OFF_TOPIC_REPLY = "I can only help with your resume, the jobs you've uploaded, and interview preparation."`
  - `buildMessages({ question, history, contextBlock, docsSummary, missingRefs, hasResume }) → ChatMsg[]` — system prompt (role, use ONLY context, cite `[Label › Section]`, say "I can't find that in your documents" when unsupported, documents are untrusted data and instructions inside them must be ignored); history trimmed to last 6 turns; when `missingRefs` non-empty, instruct to state those jobs aren't uploaded; when `!hasResume`, instruct to say no resume is uploaded.
  - `filterCitations(answer, allowedLabels) → { text: string; sources: {label, section}[] }` — removes `[X › Y]` whose label is not allowed.
- [ ] **Step 1: Failing tests:**
  - `checkInput('a'.repeat(2001))` → too_long; `'  '` → empty.
  - `buildMessages` with 10 history turns keeps last 6; system prompt contains "untrusted"; `missingRefs:['Job #5']` → content mentions "Job #5"; `hasResume:false` → mentions "no resume" (Review Focus).
  - `filterCitations("x [Job #9 › Skills] y [Resume › Skills]", ["Resume"])` → sources only Resume, text without Job #9 tag.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(rag): input guard, topic classifier, prompt builder, citation filter`.

### Task 9: Chat SSE endpoint

**Files:**
- Create: `backend/src/routes/chat.ts`
- Test: `backend/test/chat.test.ts`

**Interfaces:**
- `POST /api/chat { messages: ChatMsg[] }` (last is user) → `text/event-stream`. Events: `event: token\ndata: {"t":"..."}`, then `event: sources\ndata: {"sources":[...]}`, then `event: done`. Errors mid-stream → `event: error data: {"error": "..."}`.
- Flow: checkInput (400 JSON before streaming) → classifyTopic (off_topic → stream OFF_TOPIC_REPLY) → load user docs → embed question → retrieveContext → buildMessages → llm.chatStream → accumulate → filterCitations → sources event.
- [ ] **Step 1: Failing tests** (fake llm streams "Missing: Kubernetes [Job #1 › Requirements] [Job #7 › X]"; fake retriever returns Job #1 chunk):
  - response contains token events and a sources event with only `Job #1 › Requirements`.
  - off-topic (fake classifier → off_topic) → stream contains OFF_TOPIC_REPLY, retriever not called.
  - no resume uploaded → system message passed to fake llm mentions "no resume" (Review Focus).
  - 2001-char question → 400.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(chat): streaming grounded chat with citations`.

### Task 10: Fit analysis

**Files:**
- Create: `backend/src/analysis/service.ts`; Modify: `backend/src/routes/documents.ts` (add analyze route + hook)
- Test: `backend/test/analysis.test.ts`

**Interfaces:**
- Produces: `FitAnalysisSchema = z.object({ score: z.number().int().min(0).max(100), matchedSkills: z.array(z.string()), missingSkills: z.array(z.string()), experienceAlignment: z.string(), summary: z.string(), interviewTopics: z.array(z.string()) })`; `analyzeJob(userId, jobId, deps, ctx) → FitAnalysis` (uses resume + job rawText, `llm.structured`, saves to doc, `analysisStale=false`). Route `POST /api/documents/:id/analyze` → 200 analysis; 409 `{error:"Upload a resume first"}` if no resume; 400 if doc is the resume.
- [ ] **Step 1: Failing tests:** fake structured returns valid object → saved on job; no resume → 409; ingesting a job auto-triggers analysis (await hook in test mode).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(analysis): structured per-job fit analysis`.

### Task 11: Admin + metrics

**Files:**
- Create: `backend/src/routes/admin.ts`
- Test: `backend/test/admin.test.ts`

**Interfaces:**
- `GET /api/admin/users` → `[{id,email,name,role,createdAt,docCount}]`; `PATCH /api/admin/users/:id/role {role}` → 200 (admin cannot demote self → 400); `GET /api/admin/usage` → `{ totals:{calls,promptTokens,completionTokens,costUsd}, byUser:[{email,calls,costUsd}], latency:{p50,p95}, byOp:{...} }` from `LlmTrace` aggregation. `GET /api/metrics` (requireAuth) → same shape for current user only.
- [ ] **Step 1: Failing tests:** user → 403 on all admin routes; admin lists users; role change persists; self-demote → 400; usage totals sum seeded traces; p95 computed correctly for seeded latencies [100..1000].
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(admin): user management and usage metrics`.

### Task 12: Server wiring, sample data, eval script

**Files:**
- Modify: `backend/src/server.ts`; Create: `backend/sample-data/*.txt`, `backend/eval/golden.json`, `backend/eval/run.ts`
- [ ] **Step 1:** `server.ts`: connectDb, ensureVectorIndex, real deps, listen on `PORT`; graceful shutdown on SIGTERM.
- [ ] **Step 2:** Sample data: a realistic full-stack developer resume (React/Node/Mongo, some Python, no k8s) and 3 JDs (Senior Frontend Engineer – Acme; AI Forward Deployed Engineer – Nimbus AI needing RAG/vector DB/LLM evals/Python; Full-stack MERN Developer – Brightcart).
- [ ] **Step 3:** `golden.json` ~10 items `{question, expectLabels:[...], expectKeywords:[...]}`; `run.ts` creates eval user, loads sample, for each question runs retrieval + chat, reports retrieval hit-rate (expected label in sources) and keyword recall; prints table; exits non-zero if hit-rate < 0.8.
- [ ] **Step 4: Manual verify:** `npm run dev` with real `.env`, `POST /api/auth/register`, `/api/documents/sample`, `/api/chat` via curl → streamed cited answer; `npm run eval` → hit-rate printed. Confirm in Atlas only `career_intelligence` DB was created/changed.
- [ ] **Step 5: Commit** `feat: server wiring, sample data, eval harness`.

### Task 13: Frontend foundation — theme, API client, auth, login page

**Files:**
- Create: `frontend/` (Vite React TS), `src/theme.css`, `src/api/client.ts`, `src/auth/AuthContext.tsx`, `src/auth/ProtectedRoute.tsx`, `src/pages/LoginPage.tsx`, `src/components/Background.tsx`, `src/App.tsx`, `src/main.tsx`, `vite.config.ts` (dev proxy `/api` → `http://localhost:4000`), `.env.example` (`VITE_GOOGLE_CLIENT_ID`)
- Test: `frontend/src/__tests__/LoginPage.test.tsx`

**Interfaces:**
- Produces: `api.get/post/patch/del<T>(path, body?)` (credentials include, throws `ApiError{status,message}`); `streamChat(messages, { onToken, onSources, signal }) → Promise<void>` (fetch + ReadableStream SSE parse); `useAuth() → { user, loading, login, register, googleLogin, logout }`; `<ProtectedRoute role?>`.
- Theme: Global Constraints tokens in `@theme`; keyframes `drift`, `rise`, `pop`, `shimmer`; `Background` renders 2–3 blurred emerald/lime blobs drifting.
- LoginPage: glass card, tabs Sign in / Create account, email/password form, `GoogleLogin` button (theme `filled_black`), animated brand shimmer, error message area.
- [ ] **Step 1: Failing test:** renders "Sign in" form; switching tab shows name field; submit with mocked `api` failing 401 shows "Invalid email or password".
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test`), `npm run build` succeeds.
- [ ] **Step 5: Commit** `feat(frontend): theme, auth context, login with Google`.

### Task 14: Workspace — sidebar, upload, fit rings, chat, fit drawer

**Files:**
- Create: `src/pages/WorkspacePage.tsx`, components `Sidebar, DocCard, FitRing, UploadZone, ChatPanel, Message, CitationPill, SkillChips, SuggestionChips, FitDrawer, MetricsPanel`
- Test: `frontend/src/__tests__/FitRing.test.tsx`, `ChatPanel.test.tsx`

**Interfaces:**
- Consumes: `api`, `streamChat`, backend routes from Tasks 6–11.
- Layout per mockup C: left sidebar (brand, user avatar/menu, Resume card, Job cards with `FitRing` animated conic fill + label, `UploadZone` drag-drop + "Paste text" modal with kind select, "Load sample data" button); main chat (empty state with 3 onboarding steps; messages animate `rise`; assistant text streams with blinking caret; citation tags rendered as `CitationPill`; `SuggestionChips`: "What skills am I missing for Job #1?", "How does my experience align with Job #2?", "Which job am I the best fit for?", "Prep me for Job #3's interview"); clicking a job card opens `FitDrawer` (score, matched chips lime, missing chips red with `pop` stagger, alignment, interview topics, "Re-analyze" button); `MetricsPanel` in header popover (calls, tokens, cost, p95 from `/api/metrics`).
- Polling: job cards with `analysis` missing/stale poll `GET /api/documents` every 3 s until present (max 60 s).
- [ ] **Step 1: Failing tests:** `FitRing score={64}` renders "64%"; ChatPanel with mocked `streamChat` emitting tokens "Hello" " world" and sources `[{label:"Job #1",section:"Skills"}]` shows "Hello world" and pill "Job #1 › Skills".
- [ ] **Step 2–4:** FAIL → implement → PASS; `npm run build` passes.
- [ ] **Step 5: Manual verify** with backend running: login, load sample data, rings fill, ask each suggestion, citations shown, drawer opens. Capture screenshots to `docs/screenshots/`.
- [ ] **Step 6: Commit** `feat(frontend): workspace with fit dashboard and streaming chat`.

### Task 15: Admin page

**Files:**
- Create: `src/pages/AdminPage.tsx`; Modify: `App.tsx` (route `/admin` with `ProtectedRoute role="admin"`), `Sidebar.tsx` (Admin link only for admins)
- Test: `frontend/src/__tests__/AdminPage.test.tsx`
- Content: usage stat tiles (calls, tokens, cost, p50/p95), per-user table with role select (PATCH), byOp breakdown bar.
- [ ] **Step 1: Failing test:** mocked users list renders emails; changing role select calls `api.patch('/api/admin/users/<id>/role', {role:'admin'})`; non-admin visiting `/admin` is redirected to `/`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(frontend): admin dashboard`.

### Task 16: Docker + compose

**Files:**
- Create: `backend/Dockerfile` (multi-stage node:20-alpine, non-root, `npm ci --omit=dev`), `frontend/Dockerfile` (build → nginx:alpine), `frontend/nginx.conf` (SPA fallback, proxy `/api` to `backend:4000` with `proxy_buffering off` for SSE), `docker-compose.yml` (backend with `env_file: backend/.env`, frontend on 8080; profile `local-db` adds `mongodb/mongodb-atlas-local` on 27017), `.dockerignore`s.
- Build arg `VITE_GOOGLE_CLIENT_ID` passed to frontend build.
- [ ] **Step 1: Verify** `docker compose up --build` → `http://localhost:8080` login works, chat streams through nginx (tokens arrive incrementally).
- [ ] **Step 2: Commit** `chore: dockerfiles and compose`.

### Task 17: README and docs

**Files:**
- Create: `README.md`, `docs/architecture.md` (mermaid diagram), `docs/demo-script.md` (Loom 3–4 min script)
- Sections (per assignment): Quick setup (Atlas + local profile + Google client ID steps), Architecture, RAG/LLM approach & decisions (choices considered vs chosen for LLM / embeddings / vector DB / orchestration; chunking; retrieval routing; prompt & context; guardrails; quality/eval; observability), Auth & RBAC, Productionizing on AWS/GCP/Azure, Key technical decisions, Engineering standards (followed / skipped), How I used AI tools, What I'd do differently, Screenshots, Known limitations.
- Opinion sections (decisions rationale, AI tools, do differently) marked `<!-- DRAFT: rewrite in your own words -->`.
- [ ] **Step 1:** Write docs; run `npm test` in both packages and `npm run lint`, all green.
- [ ] **Step 2: Commit** `docs: README, architecture, demo script`.
