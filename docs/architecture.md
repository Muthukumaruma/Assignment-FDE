# Architecture

## Components

```mermaid
flowchart LR
  subgraph Browser
    UI[React SPA<br/>Vite + Tailwind + Framer Motion]
  end
  subgraph Edge["nginx (frontend container)"]
    STATIC[Static assets]
    PROXY["/api reverse proxy<br/>(SSE: buffering off)"]
  end
  subgraph API["Express API (backend container)"]
    AUTH[Auth + RBAC<br/>JWT cookie, Google ID token]
    DOCS[Documents<br/>parse → chunk → embed]
    CHAT[Chat<br/>guard → route → retrieve → prompt → stream]
    FIT[Fit analysis<br/>structured output]
    OBS[Usage / metrics<br/>llm_traces]
  end
  subgraph Atlas["MongoDB Atlas · db career_intelligence"]
    USERS[(users)]
    DOCSC[(documents)]
    CHUNKS[(chunks<br/>+ vector index)]
    TRACES[(llm_traces)]
  end
  OPENAI[[OpenAI<br/>gpt-4o-mini<br/>text-embedding-3-small]]
  GOOGLE[[Google Identity]]

  UI --> STATIC
  UI -->|fetch / SSE| PROXY --> API
  UI -. Sign in with Google .-> GOOGLE
  AUTH -->|verify ID token| GOOGLE
  AUTH --> USERS
  DOCS --> DOCSC & CHUNKS
  DOCS -->|embeddings| OPENAI
  CHAT -->|$vectorSearch filtered by userId| CHUNKS
  CHAT -->|stream| OPENAI
  FIT --> OPENAI
  DOCS -. after ingest .-> FIT
  OPENAI -. every call .-> OBS --> TRACES
```

## Chat request, step by step

```mermaid
sequenceDiagram
  participant U as Browser
  participant A as API /api/chat
  participant L as OpenAI
  participant M as Atlas

  U->>A: POST messages (cookie)
  A->>A: requireAuth, per-user rate limit, length check
  A->>L: topic classifier (skipped when keywords show it's on-topic)
  A->>M: load user's documents (labels, sizes)
  A->>A: resolveTargets("Job #2", titles, companies)
  alt corpus fits in ~6k tokens
    A->>M: load all of the user's chunks
  else larger corpus
    A->>L: embed question
    A->>M: $vectorSearch (userId + target docIds) per document
  end
  A->>A: build prompt (system rules, escaped <document> blocks, last 6 turns)
  A->>L: chat completion (stream)
  L-->>A: tokens
  A-->>U: SSE token events
  A->>A: filterCitations (drop citations to documents not in context)
  A-->>U: SSE sources + final text, done
  A->>M: llm_traces (tokens, latency, cost)
```

## Data model

| Collection | Key fields | Notes |
|---|---|---|
| `users` | email (unique), passwordHash?, googleId?, role, sessionVersion | `sessionVersion` is bumped when credentials change; older JWTs stop working |
| `documents` | userId, kind (resume/job), label ("Job #2"), jobNumber, title, company, rawText, analysis | one active resume per user |
| `chunks` | userId, docId, kind, label, section, text, order, embedding[1536] | Atlas Vector Search index `chunk_vector_idx`, filters userId/docId/kind |
| `llm_traces` | userId, requestId, op, model, tokens, latencyMs, costUsd | feeds `/api/metrics` and the admin dashboard |
