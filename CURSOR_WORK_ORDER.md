# CURSOR_WORK_ORDER.md

## Mission (autonomous mode)
Ship steady, user-facing progress on Axle with minimal human intervention.

## Hard constraints
- **Axle must remain Ollama-only** (no OpenAI API calls in the Axle app).
- Avoid risky/destructive actions without asking:
  - deletes/migrations on prod data
  - credential exfiltration
  - public pushes you’re unsure about
- Keep changes incremental and shippable.

## Allowed tools/models
- Use **Ollama** for app features (extraction/explanations) and for most reasoning.
- Use **OpenAI occasionally** ONLY for product ideation / strategy prompts (small, bounded), not for bulk coding.

## Definition of Done for each work chunk
1) `pnpm lint` passes
2) `pnpm build` passes
3) If watchlists touched and Supabase configured: `pnpm watchlists:smoke` passes
4) Commit with a clear message (prefix: watchlists:, reports:, docs:, refactor:, dev:)
5) Leave repo clean

## Current milestone (choose one high-leverage improvement per chunk)
### Priority A — Watchlists E2E UX
- Add a simple create form (year/make/model/max_price/zip/radius) with validation
- Show empty state and list of existing watchlists
- Add enable/disable toggle feedback + delete confirmation
- Add dev-only "Run alerts" button (guarded by AXLE_ENV=local|dev) that calls `/api/watchlists/run-alerts` and renders a readable result

### Priority B — Runner observability
- Store last runner run status somewhere lightweight (even in-memory or server log for now)
- Return structured JSON results and show them in UI

### Priority C — Reports polish
- Clearer rationale and source badges; confidence based on comp spread

## Commands
- Install: `pnpm install`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Watchlists smoke: `pnpm watchlists:smoke`

## Notes
- Prefer server actions + simple components; keep pages fast.
- Do not add new paid APIs.
