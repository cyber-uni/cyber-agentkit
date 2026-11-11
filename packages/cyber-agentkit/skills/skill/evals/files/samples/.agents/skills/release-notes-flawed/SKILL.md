---
name: release-notes-flawed
description: Use this skill when writing the release notes for a release. It reads prs.json, drops merge commits and internal pull requests, groups the rest by label, and writes RELEASE_NOTES.md.
---

# Release notes

## Steps

1. Find the release's merged pull requests in `prs.json` at the repository root: a list of
   `{ "number", "title", "labels" }`. If there is none, say so and stop.
2. Go through the list in order. Leave out every pull request whose title starts with `Merge pull request` or
   `Merge branch`, and every one labeled `internal`. Put each one labeled `feature` under `### Features`, and every
   other one under `### Fixes`, as a line `- <title> (#<number>)`. Leave out a heading with no lines under it.
3. Write `## Release notes`, then the two groups, to `RELEASE_NOTES.md`, and show it.

## Done when

Before reporting done, check each of these against the result. Report any that fails.

- **C1.** `RELEASE_NOTES.md` starts with a `## Release notes` heading.
- **C2.** Every pull request in the input that is not a merge commit or labeled `internal` appears exactly once, by its
  title and number.
- **C3.** No merge commit and no pull request labeled `internal` appears.
- **C4.** Each change is under `### Features` or `### Fixes`, according to its label.
- **C5.** The notes are clear.
