## Axle

Peer-to-peer car trading and selling with honest, comps-based valuations powered by local Ollama.

### Tech stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js server components + API routes / server actions
- **Database**: Postgres (Supabase)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (for listing photos)
- **State**: Minimal; Zustand/Context can be added as flows grow
- **Local AI**: Ollama (HTTP API, no hosted LLMs)

### Environment variables

Create a `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... # for local seed script only

OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EXTRACTION_MODEL=qwen2.5:latest
OLLAMA_REASONING_MODEL=llama3.1:latest
```

### Database setup

1. Create a new Supabase project.
2. In the SQL editor, run `db/schema.sql` to create the core tables.
3. Make sure Row Level Security policies are configured per your needs (not included here).

### Seed sample data

```bash
pnpm install   # or npm/yarn
pnpm seed
```

This will create one demo user and at least 12 sample listings (Z3, E46, SC400, Tacoma, Miata, WRX, 4Runner, Civic Si, Mustang GT, GX470, G35, BRZ).

### Running Ollama locally

1. Install Ollama from `https://ollama.com`.
2. Pull the models you want:

```bash
ollama pull qwen2.5
ollama pull llama3.1
```

3. Make sure the Ollama daemon is running (default `http://localhost:11434`).

The app uses Ollama for:

- **Valuation refinement** (evaluate page): When `OLLAMA_BASE_URL` and a reasoning model are set, the evaluator runs a formula-based range first (segment-specific mileage/age, trim, condition, mods), then asks the LLM to refine the range *within strict comp-based bounds*. The LLM cannot invent prices outside the comparables.
- Structuring messy listing text into JSON
- Explaining the valuation in plain English

Without Ollama, the evaluator still returns a deterministic range using the same formula and variables; only the refinement and explanation steps are skipped.

### Development

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

Key routes:

- `/` – landing page with product explanation
- `/browse` – browse listings
- `/listings/[id]` – listing detail with valuation and comps UI (once sources are wired)
- `/dashboard`, `/offers`, `/messages`, `/profile` – stubs to be built out

### Extending the valuation/comps pipeline

- Add or update source adapters under `lib/sources/*.ts`. Each adapter:
  - Accepts a normalized listing query
  - Returns an array of `NormalizedComp`
  - Handles its own rate limiting, parsing, and error isolation
- `lib/comps/fetchComps.ts` orchestrates calling sources in parallel and aggregates comps + per-source errors.
- `lib/valuation/engine.ts` implements deterministic filtering and weighting logic.
- `lib/ollama/client.ts` provides helpers for JSON-style extraction and natural-language explanations.

### Important constraints

- Never fabricate comps; if a source fails or no comps exist, show that clearly and lower confidence.
- Keep valuation explainable: show confidence scores, comp counts, and caveats when data is weak.
- Treat Facebook Marketplace as experimental and optional (`lib/sources/facebook.ts`).

### API / external connections

| What | Required? | Notes |
|------|----------|--------|
| **Supabase** | Yes | Project URL + anon key + service role key in `.env.local`. No extra API keys. |
| **Ollama** | No | Optional. If running locally, set `OLLAMA_BASE_URL` (default `http://localhost:11434`). Listing page works without it; valuation explanations are skipped if Ollama is down or missing. |
| **Comps sources** | No | `lib/sources/*` (Craigslist, forums, BAT, Cars & Bids, Facebook) are stubbed. Add your own scraping or API integrations when you have keys or permission. No API keys needed for the app to run. |

