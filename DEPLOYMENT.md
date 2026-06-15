# Deployment Instructions — Interview Coach Pro

This guide covers deploying Interview Coach Pro to **Render** (API) and **Vercel** (frontend or full stack).

---

## Prerequisites

1. **Supabase** — Run `schema.sql` in the Supabase SQL Editor.
2. **API keys** — Gemini API key and Supabase URL + key.
3. **GitHub** — Repository pushed to `https://github.com/Mahendra-Subhash/InterviewCoachPro`.

### Environment variables (required on the API host)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/apikey) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon or service role key |

Copy `.env.example` to `.env` for local development. Never commit `.env`.

---

## Option 1: Vercel Monolith (API + Frontend)

Single deployment — frontend and API share the same domain.

### Steps

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import this repo.
2. Framework preset: **Other** (uses `vercel.json`).
3. Add environment variables:
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
4. Deploy.

### How it works

- `vercel.json` routes API paths (`/api`, `/session`, `/sessions`, `/messages`, `/chat`, `/feedback`) to `main.py`.
- All other paths serve static files from `frontend/`.
- `API_BASE_URL` stays empty — the frontend calls the same origin.

### Verify

```bash
curl https://YOUR-APP.vercel.app/api/health
# {"message":"Interview Coach Pro API Running","status":"online"}
```

---

## Option 2: Render API + Vercel Frontend (Split)

Backend on Render, static frontend on Vercel CDN.

### Part A — Deploy API to Render

1. Go to [render.com](https://render.com) → **New Web Service** → connect this repo.
2. Settings:
   - **Environment:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`  
     _(Render auto-detects `Procfile` if present)_
   - **Runtime:** `python-3.12.8` (from `runtime.txt`)
3. Add environment variables: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`.
4. Deploy and note your URL: `https://YOUR-SERVICE.onrender.com`.

### Part B — Configure frontend for Render

Edit `frontend/index.html` — set the meta tag to your Render URL:

```html
<meta name="api-base-url" content="https://YOUR-SERVICE.onrender.com">
```

No trailing slash. Commit and push this change before deploying the frontend.

### Part C — Deploy frontend to Vercel

**Option C1 — Static-only (recommended for split)**

Replace `vercel.json` with:

```json
{
  "version": 2,
  "routes": [
    { "src": "/(.*)", "dest": "frontend/$1" }
  ]
}
```

No environment variables needed on Vercel for split deploy (secrets live on Render).

**Option C2 — Root directory**

Set Vercel **Root Directory** to `frontend` and use a minimal `vercel.json` with static routes only.

### Verify split deploy

1. `curl https://YOUR-SERVICE.onrender.com/api/health` → `status: online`
2. Open `https://YOUR-FRONTEND.vercel.app`
3. DevTools → Network — requests go to `onrender.com`, not `vercel.app`
4. Send a chat message and refresh — session persists

---

## Local Development

```powershell
# 1. Copy env template
copy .env.example .env
# Edit .env with your keys

# 2. Create and activate venv
python -m venv venv312
.\venv312\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run server
uvicorn main:app --reload --host 127.0.0.1 --port 8000

# 5. Open http://127.0.0.1:8000
```

---

## Deployment Files Reference

| File | Purpose |
|------|---------|
| `Procfile` | Render start command |
| `runtime.txt` | Python 3.12.8 for Render |
| `requirements.txt` | Pinned Python dependencies |
| `vercel.json` | Vercel routing (monolith) |
| `.env.example` | Environment variable template |
| `schema.sql` | Supabase database schema |
| `frontend/index.html` | `api-base-url` meta for split deploy |

See `DEPLOYMENT_CHECKLIST.md` for a full pre/post-deploy checklist.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `503` on `/chat` | Set `GEMINI_API_KEY` on the API host |
| `500` on `/sessions` | Verify Supabase env vars; run `schema.sql` |
| CORS errors (split) | Confirm `api-base-url` meta matches Render URL |
| Slow first request (Render) | Free tier cold start — wait 30–60s |
| Frontend calls wrong host | Check meta tag; redeploy frontend after editing |
