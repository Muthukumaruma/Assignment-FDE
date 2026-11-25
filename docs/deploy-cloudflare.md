# Deploying: Cloudflare Pages + R2, API on Northflank (or Render)

```
Browser ──► Cloudflare Pages (careerlens.pages.dev)
              ├─ static SPA (Vite build)
              └─ /api/* ─► Pages Function proxy ─► Northflank service (Docker, Express API)
                                                     ├─► MongoDB Atlas (data + vector search)
                                                     ├─► Cloudflare R2 (original uploads, private)
                                                     └─► OpenAI
```

**Why this shape.** The Express API uses the MongoDB driver, which doesn't run as a plain Cloudflare
Worker, so it runs as a container on Northflank (Render works the same way; see 2b). The browser only ever talks to the Pages domain:
the Pages Function forwards `/api/*`, which keeps the session cookie first-party and lets the streaming
chat (SSE) pass straight through.

Cost: Cloudflare Pages and R2 free tiers, Atlas M0, and the container host's free tier (plus OpenAI usage).
If the host puts the service to sleep when idle, the first request after a nap is slow; the proxy then returns
a clear "starting up" message instead of hanging.

---

## 0. Push the repo to GitHub
Northflank (or Render) and Cloudflare Pages both deploy from the GitHub repository.

## 1. Cloudflare R2 (original documents)
1. Cloudflare dashboard → **R2** → enable R2 (the free tier includes 10 GB; Cloudflare may ask for a payment method).
2. **Create bucket** `careerlens-docs`. Keep it **private** (no public access, no custom domain).
3. R2 → **Manage API tokens** → **Create API token** → permission **Object Read & Write**, scoped to `careerlens-docs`.
4. Note the **Account ID**, **Access Key ID** and **Secret Access Key** (the secret is shown once).

## 2a. Northflank (API) — the host used for this project
1. northflank.com → sign in with GitHub → **Create project** (pick a region close to your Atlas cluster).
2. **Create new → Service → Combined service** (build + deploy in one).
3. **Repository:** `Muthukumaruma/Assignment-FDE`, branch `feat/career-intelligence` (or `main` after merging).
4. **Build options → Dockerfile:**
   | Setting | Value |
   |---|---|
   | Dockerfile location | `/backend/Dockerfile` |
   | Build context | `/backend` |
5. **Networking → Ports:** add port `4000`, protocol **HTTP**, tick **Publish publicly**. Northflank gives you a URL like
   `https://p01--careerlens-api--xxxx.code.run`.
6. **Environment → Runtime variables** (put the secrets in a *Secret group* if you prefer):
   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `MONGODB_URI` | your Atlas connection string |
   | `MONGODB_DB` | `career_intelligence` |
   | `OPENAI_API_KEY` | your key |
   | `JWT_SECRET` | a long random string (`openssl rand -hex 32`) |
   | `PROXY_SECRET` | another long random string; the **same value** goes into Cloudflare Pages in step 3 |
   | `TRUST_PROXY_HOPS` | `2` (Cloudflare proxy + Northflank load balancer) |
   | `CORS_ORIGIN` | `https://<your-project>.pages.dev` |
   | `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL` | optional (Google sign-in / first admin) |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | optional, from step 1 |
7. **Health checks:** add an HTTP readiness check on port `4000`, path `/api/health`.
8. **Create service.** Watch the build logs; when it's running, open `https://<northflank-url>/api/health` and check for
   `{"status":"ok"}`. Any other path returns 403 "Direct access is not allowed", which is expected because of `PROXY_SECRET`.
9. Atlas → **Network Access** → allow Northflank's outbound IPs (or `0.0.0.0/0` for a demo).

Use the Northflank URL as `API_ORIGIN` in step 3.

## 2b. Render (API) — alternative
1. Render dashboard → **New → Blueprint** → select the GitHub repo. It reads [`render.yaml`](../render.yaml).
2. Fill in the secrets it asks for:
   | Key | Value |
   |---|---|
   | `MONGODB_URI` | your Atlas connection string |
   | `OPENAI_API_KEY` | your key |
   | `GOOGLE_CLIENT_ID` | OAuth web client ID (optional) |
   | `ADMIN_EMAIL` | the Google account that should be admin |
   | `CORS_ORIGIN` | `https://<your-project>.pages.dev` |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | from step 1 |
   | `PROXY_SECRET` | a long random string (e.g. `openssl rand -hex 32`); the **same value** goes into Pages in step 3 |
   `JWT_SECRET` is generated automatically. `TRUST_PROXY_HOPS=2` is preset; it is safe only because `PROXY_SECRET`
   makes the API reject anything that did not come through the Pages proxy (so nobody can fake their IP to dodge rate limits).
3. Atlas → **Network Access** → allow Render's outbound IPs (or `0.0.0.0/0` for a demo).
4. Wait for the deploy, then open `https://careerlens-api.onrender.com/api/health` and check for `{"status":"ok"}`.
   Any other path on the Render URL returns 403 ("Direct access is not allowed"), which is expected.

## 3. Cloudflare Pages (frontend + proxy)
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → select the repo.
2. Build settings:
   | Setting | Value |
   |---|---|
   | Root directory | `frontend` |
   | Build command | `npm run build` |
   | Build output | `dist` |
3. **Environment variables** (Production):
   | Key | Value |
   |---|---|
   | `API_ORIGIN` | your Northflank URL (e.g. `https://p01--careerlens-api--xxxx.code.run`), or your Render URL |
   | `PROXY_SECRET` | the same value as on Northflank/Render (mark it **Encrypt**) |
   | `VITE_GOOGLE_CLIENT_ID` | OAuth web client ID (optional; baked in at build time) |
4. Deploy. The `functions/api/[[path]].ts` file is picked up automatically.

Command-line alternative: `cd frontend && npm run build && npx wrangler pages deploy dist`.

## 4. Google sign-in (optional)
Google Cloud Console → Credentials → your OAuth web client → **Authorized JavaScript origins** → add
`https://<your-project>.pages.dev`. Use the same client ID in Render (`GOOGLE_CLIENT_ID`) and Pages (`VITE_GOOGLE_CLIENT_ID`).

## 5. Check it works
- Open `https://<your-project>.pages.dev`, create an account, and click **Try with sample data**.
- Upload a PDF with **+ Add job**, open the job, then **Download** the original: it is served from R2 through the API.
- Ask a question: the answer should stream in token by token.

## Verified locally
`npx wrangler pages dev dist --binding API_ORIGIN=http://localhost:4000` ran the real Pages Function
in Cloudflare's local runtime. Login set the cookie on the Pages origin, deep links such as `/admin` served the SPA,
and chat streamed through the proxy (first byte in ~55 ms).
