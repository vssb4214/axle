# Task

## ID
watchlists-e2e-form

## Goal
Add a simple create form to /watchlists with validation (year/make/model/max_price/zip/radius). Show success/error status after create.

## Allowed Paths
app/watchlists/
components/
lib/

## Validation
pnpm lint
pnpm build

## Abort Conditions
- Any lockfile changes
- Changes outside Allowed Paths
- Build fails

## Notes
- Keep it simple; no new dependencies.
- Axle stays Ollama-only.
