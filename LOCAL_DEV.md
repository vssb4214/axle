# Axle — Local development (Mac)

This is the fast path to getting Axle running locally with **Supabase** + optional **Ollama**.

## Prereqs

- Node.js (already installed on this machine)
- pnpm
- Ollama (optional)

## Install deps

```bash
cd /Users/trap/axle
pnpm install
```

## Environment variables

Create `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (only needed for seed scripts / admin server actions)

Optional (Ollama):

- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_EXTRACTION_MODEL` (default: `qwen2.5:latest`)
- `OLLAMA_REASONING_MODEL` (default: `llama3.1:latest`)

Optional (safety/env):

- `AXLE_ENV=local` — enables dev-only endpoints/scripts that are disabled elsewhere (e.g. the watchlists runner stub + smoke tests). Keep this set to `local` for your dev Supabase.
  - If you see "Refusing to run watchlists-smoke against a potentially production environment", it usually means `AXLE_ENV` is missing from `.env.local`.

## Run

```bash
pnpm dev --port 3000
```

Open:
- http://localhost:3000
- http://localhost:3000/health (sanity checks)

## If things look weird

- Clear Next cache: `rm -rf .next`
- Reinstall deps: `rm -rf node_modules && pnpm install`
- Ensure you're pointing at a *dev* Supabase project (never prod)

## Ollama

Install + run:

```bash
brew install ollama
brew services start ollama
ollama pull qwen2.5:latest
ollama pull llama3.1:latest
```

If Ollama is down, Axle should still work — only the extraction/explanations are skipped.

## Deployment readiness quick checks

```bash
pnpm lint
pnpm test
pnpm build
```

Notes:
- `pnpm test` currently runs: lint + build (fast sanity check)
- `pnpm build` is what matters most for deploy readiness
- Run `pnpm valuation:regression` after valuation changes to confirm pricing outputs stay within baselines.
