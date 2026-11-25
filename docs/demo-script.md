# Loom demo script (about 4 minutes)

Talking points, not a script to read. Say them in your own words.

## 0:00 – Intro (20 s)
- Who you are; you picked Option 4, Career Intelligence, because you were job hunting yourself.
- One line: "Upload a resume and jobs, get a fit score per job, and ask grounded questions with citations."

## 0:20 – Sign in (20 s)
- Login page: email/password or Google. Mention the httpOnly JWT cookie and the user/admin roles.

## 0:40 – Sample data and fit rings (40 s)
- Click **Try with sample data**. The resume and three jobs appear; the rings fill as the background fit analysis finishes.
- Open **Job #2**: matched skills in lime, gaps in red, experience summary, interview topics. Click Re-score.

## 1:20 – Chat (70 s)
- Ask "What skills am I missing for Job #2?". Point out the streaming, the Source column and the citation pills.
- Click a pill: it opens that document.
- Ask "What about Job #7?": it says that job isn't uploaded (no hallucination).
- Ask something off-topic ("Write a poem"): it refuses politely.

## 2:30 – Under the hood (60 s)
- Show `docs/architecture.md`: section-aware chunking, job routing, full-text-when-small vs. Atlas `$vectorSearch` filtered by userId.
- Show `npm run eval` output: the citation rate went from 40% to 100% after prompt changes (the eval caught it).
- Admin page: per-operation cost, p95 latency, per-user spend from `llm_traces`.

## 3:30 – Engineering and AI tools (30 s)
- Tests written first (104 tests), Docker Compose, the security fixes found by review.
- How you used Claude Code: spec → plan → tests first → you made the decisions and reviewed the output.

## 4:00 – Close
- What you'd do next (hybrid search, skill taxonomy, evidence quotes).
