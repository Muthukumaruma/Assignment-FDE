# CareerLens AI — Career Intelligence Assistant (Design)

Date: 2026-11-25 · Status: draft for approval

## Intent / why
Interview take-home for Newpage Solutions (AI Forward Deployed Engineer role), Option 4
"Career Intelligence Assistant". Evaluators score: working RAG core, attractive UI/UX,
reasoning on RAG choices (chunking, models, retrieval, prompts, context, guardrails,
quality, observability), engineering excellence (clean, tested, containerised, observable),
and AI-assisted development approach. "Solid basic > over-engineered."
The candidate (Muthu) must be able to explain every part of the code, and will rewrite
the README's opinion sections in their own words and record a Loom demo.

## Goals
- Upload one resume + multiple job descriptions (PDF / DOCX / TXT, or pasted text).
- Ask grounded questions: fit, skill gaps, experience alignment, interview prep.
- Per-job fit dashboard (score ring, matched / missing skills).
- Streaming chat with citations to document + section.
- Visually striking UI: "Midnight Emerald" theme (near-black, emerald #10b981 / lime #a3e635
  accents, neon glow, drifting blurred blobs, rise/pop micro-animations).
- `docker compose up` runs everything; tests run with OpenAI mocked.

## Authentication & RBAC (added on Muthu's request)
- **Email + password**: bcrypt hash; **Google OAuth** via Google Identity Services — frontend
  "Sign in with Google" button returns an ID token, backend verifies it with `google-auth-library`
  (`GOOGLE_CLIENT_ID`), finds-or-creates the user (links by verified email).
- Session: our own JWT (HS256, `JWT_SECRET`, 7d) in an httpOnly, SameSite=Lax cookie.
- Roles: `user` (own resume/jobs/chat only) and `admin` (+ Admin page: list users, change roles,
  per-user usage/cost from `llm_traces`). `ADMIN_EMAIL` env → that account is admin on sign-up/login.
- Tenant isolation: `userId` on documents, chunks, traces; **vector search always filters by userId**;
  every query scoped by `req.user.id`.
- Middleware: `requireAuth`, `requireRole('admin')`. Frontend: login/signup page, protected routes,
  admin route hidden for non-admins.
- Out of scope (README "productionise"): password reset email, refresh-token rotation, MFA,
  per-user rate limiting beyond a basic global limiter.
- Collection `users { email, name, passwordHash?, googleId?, avatarUrl?, role, createdAt }`.

## Non-goals
Voice, resume rewriting/generation, job scraping from URLs, mobile-first layout.

## Anti-goals
- Answers not grounded in the uploaded documents (hallucinated skills/experience).
- Opaque framework magic the candidate can't explain (no LangChain/LlamaIndex).
- Committing secrets (the Atlas URI lives only in `backend/.env`).

## Constraints
- Stack: MERN, TypeScript on both sides. Repo layout: `frontend/` and `backend/` separate.
- LLM provider: OpenAI (user's key). Models configurable via env:
  `OPENAI_CHAT_MODEL` (default `gpt-4o-mini`), `OPENAI_EMBED_MODEL` (`text-embedding-3-small`, 1536 dims).
- DB: user's MongoDB Atlas cluster, **new database `career_intelligence` only**; never touch other DBs.
  `docker-compose` also offers `mongodb/mongodb-atlas-local` for reviewers without Atlas.
- Time: submit ASAP — keep scope tight.

## Approaches considered
1. **Hand-written RAG pipeline, Express + React, MongoDB Atlas Vector Search** — chosen.
   Fully explainable; one database for docs, chunks, vectors and traces; same code local→cloud.
2. LangChain/LlamaIndex orchestration — faster wiring, but hides exactly the decisions being graded.
3. Separate vector DB (Chroma/Qdrant) beside Mongo — two stores to run and sync for no gain at this scale.
(Earlier Python/FastAPI option was dropped: user chose MERN.)

## Architecture
```
React (Vite, TS, Tailwind, Framer Motion)
   │  REST + SSE (fetch stream)
Express API (TS)
   ├─ ingest:  parse (pdf-parse / mammoth) → normalise → section-aware chunk → embed → store
   ├─ analyze: per-job structured fit analysis (JSON schema output) → cached on job doc
   ├─ chat:    guard → route (which docs) → vector search (filtered) → prompt → stream → cite
   └─ observability: pino logs, request id, llm_traces collection, /api/health, /api/metrics
MongoDB `career_intelligence`
   documents { _id, kind: resume|job, label ("Job #2"), title, company, rawText, createdAt, analysis? }
   chunks    { docId, kind, label, section, text, embedding[1536], order }
   llm_traces{ requestId, op, model, promptTokens, completionTokens, latencyMs, costUsd, createdAt }
   vector index `chunk_vector_idx` on chunks.embedding (cosine) with filter fields userId, docId, kind
   users     { email, name, passwordHash?, googleId?, role }
   (documents, chunks, llm_traces all carry userId)
```

## Key RAG decisions
- **Chunking:** documents are short (1–3 pages). Split on detected section headings
  (Skills, Experience, Education, Projects, Requirements, Responsibilities, Nice-to-have…),
  then cap ~800 tokens with ~100 overlap inside long sections. Each chunk keeps doc label + section.
- **Retrieval routing:** parse the question for job refs ("Job #2", "#2", job title/company match).
  If targeted: filter to that job + resume, top-k per doc (balanced so the resume is always present).
  If none: search all, top-k=8, ensure ≥2 resume chunks. Small corpus ⇒ also fallback to
  whole-doc context when total text fits the budget (documented trade-off).
- **Prompt:** system prompt defines role, "use only CONTEXT", cite as `[Job #2 › Requirements]`,
  say "I can't find that in your documents" when unsupported. Documents wrapped in
  `<document label=… section=…>` tags and declared untrusted data.
- **Context management:** token budget (≈6k context), last 6 chat turns kept; older turns dropped.
- **Fit analysis:** separate call with OpenAI structured outputs (JSON schema):
  `{ score 0-100, matchedSkills[], missingSkills[], experienceAlignment, summary }`; validated with zod.
- **Guardrails:** input length cap; topic classifier step (cheap prompt or keyword+LLM) to refuse
  off-topic; prompt-injection hardening via tagging + instruction hierarchy; upload type/size limits;
  output: citations must reference retrieved labels (strip unknown ones).
- **Quality:** `backend/eval/` golden set (sample resume + 3 JDs + ~10 Q&A with expected facts);
  `npm run eval` reports retrieval hit-rate and answer keyword checks (LLM-as-judge optional).
- **Observability:** pino JSON logs with requestId; every LLM call recorded in `llm_traces`;
  `/api/metrics` returns counts, p50/p95 latency, token & cost totals (shown in a small UI panel).

## API
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/google` `{credential}`,
  `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `GET /api/admin/usage` (admin only)
- All routes below require auth and are scoped to the current user.
- `POST /api/documents` (multipart file or `{text, kind, title}`) → ingests, returns doc
- `GET /api/documents`, `DELETE /api/documents/:id`
- `POST /api/documents/:id/analyze` → fit analysis (job vs current resume), cached
- `POST /api/chat` `{ messages[] }` → SSE stream: `token` events, final `sources` event
- `GET /api/health`, `GET /api/metrics`

## UI
Left sidebar: brand, resume card, job cards with animated fit rings, upload drop zone.
Main: chat with streaming text, citation pills, gap chips; suggested-question chips;
tab/drawer for per-job fit detail (matched vs missing, alignment summary). Empty state with
onboarding steps. Sample-data button loads demo resume + 3 JDs (helps reviewers & Loom).

## Testing / engineering
- Backend Vitest: chunker, job-ref router, prompt builder, guard, citation filter; Supertest API
  tests with OpenAI client and vector search mocked (in-memory Mongo via mongodb-memory-server
  for CRUD only).
- Frontend Vitest + Testing Library: a few component tests.
- ESLint + Prettier, strict TS, env validated with zod, centralised error handler.
- Dockerfiles for both; compose: backend, frontend (nginx), optional atlas-local profile.
- README: setup, architecture diagram, RAG decisions, productionisation (AWS/GCP/Azure), standards,
  AI-tool usage, what next — opinion sections left as clearly-marked drafts for Muthu to rewrite.

## Calls made during review (Claude's, not yet confirmed by Muthu)
- One active resume: uploading a new one replaces the old (and invalidates cached fit analyses).
- Fit analysis runs automatically after a job is added or the resume changes.
- Vector search index is created programmatically on backend startup if missing.
- Chat history lives in the browser (not persisted server-side).

## Left to the builder
Exact component breakdown, animation details, heading-detection heuristics, sample data content.
