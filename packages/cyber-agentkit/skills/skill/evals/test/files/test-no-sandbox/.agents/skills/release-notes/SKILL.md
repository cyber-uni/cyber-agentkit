---
name: release-notes
description: Write the release notes for a release from its merged pull requests, as in "write the release notes", "draft the changelog for 2.0", or "what shipped this release".
---

# Release notes

## Steps

1. Find the release's merged pull requests in `prs.json` at the repository root: a list of
   `{ "number", "title", "labels" }`. If there is none, say so and stop.
2. Run `node <this skill's folder>/scripts/notes.mjs prs.json > RELEASE_NOTES.md`. It leaves out merge commits and
   pull requests labeled `internal`, and groups the rest under Features or Fixes by their labels.
3. Show `RELEASE_NOTES.md`.

## Done when

Before reporting done, check each of these against the result. Report any that fails.

- **C1.** `RELEASE_NOTES.md` starts with a `## Release notes` heading.
- **C2.** Every pull request in the input that is not a merge commit or labeled `internal` appears exactly once, by its
  title and number.
- **C3.** No merge commit and no pull request labeled `internal` appears.
- **C4.** Each change is under `### Features` or `### Fixes`, according to its label.
