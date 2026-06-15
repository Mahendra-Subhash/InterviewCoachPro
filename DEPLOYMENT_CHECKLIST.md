# Interview Coach Pro — Deployment Checklist

Use this checklist when deploying to **Render** (backend) and/or **Vercel** (frontend or full stack).

---

## Pre-Deployment (All Paths)

- [ ] **Supabase schema applied** — Run `schema.sql` in Supabase SQL Editor
- [ ] **Supabase tables verified** — `chat_sessions`, `chat_messages`, `feedback` exist
- [ ] **Gemini API key** obtained from [Google AI Studio](https://aistudio.google.com/apikey)
- [ ] **Supabase credentials** copied from Project Settings → API (`URL` + `anon` or `service_role` key)
- [ ] **Git repo pushed** to GitHub/GitLab (Render and Vercel deploy from git)
- [ ] **`.env` not committed** — confirm `.gitignore` includes `.env`
- [ ] **Commit `schema.sql`** — currently untracked; add before deploy for team reproducibility

### Required environment variables (all deployments)

| Variable | Example | Set on |
|----------|---------|--------|
| `GEMINI_API_KEY` | `AIza...` | Render and/or Vercel |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Render and/or Vercel |
| `SUPABASE_KEY` | `eyJhbG...` | Render and/or Vercel |

Create a local `.env` file (never commit):

```env
GEMINI_API_KEY=your_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_key_here
```

---

## Option A: Vercel Monolith (Frontend + API on Vercel)

Best for simplest deploy — single domain, no CORS configuration needed.

### Vercel project setup

- [ ] Import repository in [Vercel Dashboard](https://vercel.com)
- [ ] Framework preset: **Other** (uses `vercel.json`)
- [ ] Root directory: repository root
- [ ] Build command: (default — Vercel detects `vercel.json`)

### Environment variables (Vercel → Settings → Environment Variables)

- [ ] `GEMINI_API_KEY`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_KEY`
- [ ] Apply to **Production**, **Preview**, and **Development**

### Verify `vercel.json` routing

Current routes (already configured):

| Path pattern | Destination |
|--------------|-------------|
| `/api/*`, `/session*`, `/sessions*`, `/messages*`, `/chat*`, `/feedback*` | `main.py` (Python) |
| Everything else | `frontend/$1` (static) |

### Post-deploy smoke tests

- [ ] `GET https://your-app.vercel.app/api/health` → `{"status":"online"}`
- [ ] App loads at `https://your-app.vercel.app/`
- [ ] Create new session — appears in sidebar
- [ ] Send a chat message — Gemini responds
- [ ] Refresh page — session and messages persist
- [ ] Submit feedback on an AI message — no error
- [ ] Delete session — removed from sidebar

### Vercel monolith notes

- `frontend/script.js` uses `API_BASE_URL = ""` (same origin) — **no meta tag change needed**
- Python runtime on Vercel is managed by `@vercel/python` builder
- First chat request may be slow (cold start)

---

## Option B: Render API + Vercel Frontend (Split Deploy)

Best when you want the API on Render's always-on or dedicated web service and static frontend on Vercel CDN.

### Part 1 — Render (Backend)

#### Service setup

- [ ] Create **Web Service** on [Render](https://render.com)
- [ ] Connect git repository
- [ ] **Environment:** Python 3
- [ ] **Build command:** `pip install -r requirements.txt`
- [ ] **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`  
  _(or use included `Procfile` if Render auto-detects it)_
- [ ] **Runtime:** `runtime.txt` specifies `python-3.12.8`

#### Environment variables (Render → Environment)

- [ ] `GEMINI_API_KEY`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_KEY`

#### Render post-deploy tests

- [ ] `GET https://your-service.onrender.com/api/health` → `{"status":"online"}`
- [ ] `GET https://your-service.onrender.com/sessions` → `[]` or session list (not 500)
- [ ] Note your Render URL: `https://________________.onrender.com`

#### Render notes

- Free tier services **spin down** after ~15 min inactivity — first request may take 30–60s
- Upgrade to paid tier for always-on if needed
- CORS is already `allow_origins=["*"]` in `main.py` — no backend CORS changes needed

---

### Part 2 — Vercel (Frontend only)

#### Configure backend URL in frontend

- [ ] Edit `frontend/index.html` — set the meta tag:

```html
<meta name="api-base-url" content="https://your-service.onrender.com">
```

Replace `your-service` with your actual Render service name. **No trailing slash.**

#### Vercel project setup (static frontend)

- [ ] Import same repository (or a frontend-only branch)
- [ ] Option 1 — **Override `vercel.json`** for static-only:

```json
{
  "version": 2,
  "routes": [
    { "src": "/(.*)", "dest": "frontend/$1" }
  ]
}
```

- [ ] Option 2 — Set Vercel **Root Directory** to `frontend` and remove Python build

> Do **not** use the monolith `vercel.json` (with `@vercel/python`) for frontend-only deploy unless you intend to run the API on Vercel too.

#### Environment variables on Vercel (frontend-only)

- [ ] **None required** for split deploy — API keys live on Render only
- [ ] Backend URL is set via HTML meta tag, not env vars

#### Split deploy smoke tests

- [ ] Frontend loads at `https://your-frontend.vercel.app/`
- [ ] Browser DevTools → Network — API calls go to `https://your-service.onrender.com/sessions` (not Vercel domain)
- [ ] Create session, chat, refresh — persistence works
- [ ] No CORS errors in browser console

---

## Option C: Local Development

- [ ] Create `.env` with all three variables
- [ ] Create venv: `python -m venv venv312`
- [ ] Activate: `venv312\Scripts\activate` (Windows) or `source venv312/bin/activate` (macOS/Linux)
- [ ] Install: `pip install -r requirements.txt`
- [ ] Run: `uvicorn main:app --reload --host 127.0.0.1 --port 8000`
- [ ] Open: `http://127.0.0.1:8000` (FastAPI serves frontend + API)
- [ ] Or open `frontend/index.html` via Live Server — script auto-points to port 8000

### Local verification commands

```powershell
# Health check
Invoke-RestMethod http://127.0.0.1:8000/api/health

# List sessions
Invoke-RestMethod http://127.0.0.1:8000/sessions
```

---

## Post-Deployment Monitoring

- [ ] **Render logs** — watch for `GEMINI_API_KEY is not set` warning at startup
- [ ] **Supabase dashboard** — confirm rows appear in `chat_sessions` and `chat_messages` after testing
- [ ] **Gemini quota** — monitor usage in Google AI Studio
- [ ] **Error rates** — check Vercel/Render dashboards for 5xx responses

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `503` on `/chat` | Missing `GEMINI_API_KEY` | Set env var on host, redeploy |
| `500` on `/sessions` | Missing/invalid Supabase creds | Verify `SUPABASE_URL` and `SUPABASE_KEY` |
| `500` on `/sessions` | Schema not applied | Run `schema.sql` in Supabase |
| CORS error in browser | Wrong API URL or backend down | Check meta tag URL; verify Render service is up |
| Chat works locally, fails in prod | Env vars not set on host | Add all 3 vars in dashboard |
| Empty sessions after refresh | Frontend pointing to wrong API | Verify `api-base-url` meta tag (split deploy) |
| Slow first request on Render | Cold start (free tier) | Wait or upgrade plan |
| `ModuleNotFoundError: fastapi` | Wrong Python env | Use `venv312` locally; ensure Render runs `pip install` |

---

## Security checklist (before public launch)

- [ ] Replace public RLS policies with authenticated user policies
- [ ] Add user authentication (Supabase Auth recommended)
- [ ] Restrict CORS to your frontend domain(s)
- [ ] Add rate limiting on `/chat`
- [ ] Rotate API keys if ever exposed
- [ ] Use Supabase **service role** key only on server, never in frontend

---

## Files added/used for deployment

| File | Purpose |
|------|---------|
| `Procfile` | Render process definition |
| `runtime.txt` | Python 3.12 for Render |
| `vercel.json` | Vercel monolith routing |
| `requirements.txt` | Python dependencies |
| `frontend/index.html` | `api-base-url` meta for split deploy |
| `schema.sql` | Database initialization |

---

*Last updated: 2026-06-15 (project audit)*
