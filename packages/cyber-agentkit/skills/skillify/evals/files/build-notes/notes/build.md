# Notes: rebuilding after a change to src/

Session of 2026-10-02.

## What I asked

"I changed src/load.ts. Rebuild the bundles and format them before you commit."

## What was done

1. Ran `pnpm run build`. It regenerates three bundles: `skills/check/scripts/check.mjs`,
   `skills/load/scripts/load.mjs`, and `skills/list/scripts/list.mjs`.
2. Committed the bundles with the change to `src/load.ts`.

## Correction

I stopped the commit: "Format first. The bundles must be formatted, or the next build shows a diff."
So the order became: build, then `pnpm run format`, then commit the source change and every bundle together.

## Check

Before committing, `git status` showed only `src/` and `skills/*/scripts/*.mjs` changed.
