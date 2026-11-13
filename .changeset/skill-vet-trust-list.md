---
"cyber-agentkit": minor
---

`/skill vet` reads its trusted publishers from the `skill-design.vet.trusted-publishers` reference, merged across the
reference tiers (managed, repo, user, and plugin), so a team sets them once. Each tier adds GitHub owners with
`merge: combine`, one list item each under `## Trusted publishers`; `--trust` still adds names for one run. The
report's new `trust` field lists every trusted name with where it came from. When the publisher is not trusted, or the
source has no publisher, a warning-level Security failure now blocks the install too (`blockedBy: untrusted-warning`);
for a trusted publisher only a critical failure blocks.
