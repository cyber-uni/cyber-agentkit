# Skills installed by package managers: changes

## 2026-10-20

- What changed: topic created.
- Why: the reference spec (Q12, R58) must find a standalone skill's default documents in the folders a package
  manager writes, and the repo rule needs evidence behind each folder.
- Conclusion changed materially: n/a (first version).
- Triggered by: pnpm 12.11.0 release notes, PR #16744, `skills` 1.7.4 source, and vendor docs, logged as
  E-PM-* in `evidence.md`.
- Corrected premise: pnpm links as `pnpm-<package>-<skill>`, into existing agent skill folders (not `.agents/skills`
  by default), after `pnpm approve`.
