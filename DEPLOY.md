# Deploy Axle online (after GitHub benefits are active)

Use this checklist when you're ready to host Axle on the internet.

---

## 1. Push code to GitHub

```bash
cd /Users/surajbendi/Axle
git init
git add .
git commit -m "Initial Axle app"
```

Create a new repository on [GitHub](https://github.com/new) (e.g. `axle` or `axle-car-trading`). Then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

---

## 2. Deploy frontend + API on Vercel (free)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New Project** → import your GitHub repo.
3. Leave framework preset as **Next.js**; leave root directory as is.
4. **Environment variables** (add these in the Vercel project settings):
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service_role key (for sync-profile and seed if you run it from CI)
5. Deploy. Your app will be live at `https://your-project.vercel.app`.

**Note:** Do **not** add `OLLAMA_*` to Vercel. Ollama runs on a separate server (step 4).

---

## 3. Supabase (already done)

- Your database and auth are already on Supabase.
- In Supabase **Authentication → URL Configuration**, add your Vercel URL to **Redirect URLs** (e.g. `https://your-project.vercel.app/**`) so auth redirects work after login.

---

## 4. Ollama on a server (when you have student credits)

When your GitHub Student Developer Pack is active:

1. **DigitalOcean** (often $100–$200 in credits):
   - Create a droplet (e.g. **Ubuntu 22.04**, smallest plan with 2GB RAM).
   - SSH in and install Ollama:  
     `curl -fsSL https://ollama.com/install.sh | sh`
   - Run: `ollama serve` (or use a systemd service so it runs on boot).
   - Pull models: `ollama pull qwen2.5` and `ollama pull llama3.1`.
   - Expose Ollama only if needed (e.g. firewall rule for your Vercel server IP, or a small reverse proxy with auth). For MVP you can bind to `0.0.0.0:11434` and restrict by firewall.

2. **Environment variable** (on Vercel):
   - `OLLAMA_BASE_URL` = `http://YOUR_DROPLET_IP:11434`  
   (Use HTTPS + auth in production if the server is public.)

3. Optional: **OLLAMA_EXTRACTION_MODEL** and **OLLAMA_REASONING_MODEL** if you use different model names.

---

## 5. Quick recap

| What              | Where        | Cost              |
|-------------------|-------------|-------------------|
| Next.js app       | Vercel      | Free tier         |
| DB / Auth / Storage | Supabase  | Free tier         |
| Ollama (AI)       | Your server (e.g. DO droplet) | Student credits |

After deployment, open your Vercel URL, go to **Browse** and **Sign in** to confirm everything works.
