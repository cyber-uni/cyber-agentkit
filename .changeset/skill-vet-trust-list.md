---
"cyber-agentkit": minor
---

`/skill vet` reads its trusted sources from the `skill-design.vet.trusted-sources` reference, merged across the
reference tiers (managed, repo, user, and plugin), so a team sets them once. Each tier adds entries with
`merge: combine`, one list item each under `## Trusted sources`, in the source forms of Claude Code's marketplace
allowlist: `owner/repo`, `owner/*`, an `https://` git URL, an absolute folder, or a
`{ source: github, repo: owner/repo, ref: v1, path: x }` mapping. Entries match exactly, ref and path included.
`--trust` takes the same forms for one run. The report's new `trust` field says whether the source is trusted, which
entry covers it, and where each entry came from. When no entry covers the source, a warning-level Security failure now
blocks the install too (`blockedBy: untrusted-warning`); for a trusted source only a critical failure blocks.

`vet` also takes a local folder as its source (`./vendor/skills`, `/opt/skills`, `~/skills`). It copies the folder to a
temporary folder without its `.git` folder or symbolic links, runs nothing from it, git included, and reads no GitHub
signals for it.
