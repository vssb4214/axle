# Current Axle Task

## Goal (user-visible)
Ship visible progress in the app every day (not just infra).

## Current task
Wire "Mode 2" of `scripts/bot/run.sh` to use Cursor `agent` as the change producer, then use it to land a user-visible app improvement (VIN-based vehicle key + comps accuracy).

## ETA
First user-visible improvement commit: 60–90 min.

## Next step
Create 2 worktrees and run Worker A (VIN→vehicle_key→comps) and Worker B (condition schema wired through evaluator + explanation).
