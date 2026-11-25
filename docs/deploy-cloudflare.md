# Deploying: Cloudflare Pages + R2, API on Render

```
Browser ──► Cloudflare Pages (careerlens.pages.dev)
              ├─ static SPA (Vite build)
              └─ /api/* ─► Pages Function proxy ─► Render web service (Docker, Express API)
                                                     ├─► MongoDB Atlas (data + vector search)
                                                     ├─► Cloudflare R2 (original uploads, private)
                                                     └─► OpenAI
```

**Why this shape.** The Express API uses the MongoDB driver, which doesn't run as a plain Cloudflare
Worker, so it runs as a container on Render's free tier. The browser only ever talks to the Pages domain:
the Pages Function forwards `/api/*`, which keeps the session cookie first-party and lets the streaming
chat (SSE) pass straight through.

Cost: Cloudflare Pages and R2 free tiers, Render free tier, Atlas M0 = **$0** (plus OpenAI usage).
Trade-off: Render's free service sleeps after ~15 minutes idle, so the first request after a nap takes
~30–60 s (the proxy returns a clear "starting up" message instead of hanging).

---

## 0. Push the repo to GitHub
Render and Cloudflare Pages both deploy from a Git repository.

## 1. Cloudflare R2 (original documents)
1. Cloudflare dashboard → **R2** → enable R2 (the free tier includes 10 GB; Cloudflare may ask for a payment method).
2. **Create bucket** `careerlens-docs`. Keep it **private** (no public access, no custom domain).
3. R2 → **Manage API tokens** → **Create API token** → permission **Object Read & Write**, scoped to `careerlens-docs`.
4. Note the **Account ID**, **Access Key ID** and **Secret Access Key** (the secret is shown once).

## 2. Render (API)
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
   `JWT_SECRET` is generated automatically, and `TRUST_PROXY_HOPS=2` is preset (Cloudflare + Render).
3. Atlas → **Network Access** → allow Render's outbound IPs (or `0.0.0.0/0` for a demo).
4. Wait for the deploy, then open `https://careerlens-api.onrender.com/api/health` and check for `{"status":"ok"}`.

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
   | `API_ORIGIN` | `https://careerlens-api.onrender.com` (your Render URL) |
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
