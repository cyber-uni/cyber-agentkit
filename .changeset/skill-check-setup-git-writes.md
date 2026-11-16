---
'cyber-agentkit': minor
---

`skill check` adds VER-12, a warning for an outcome case whose setup script writes under `.git/hooks` or to the
repository's git config (`git config` without `--global`, or a write to `.git/config`). Both are read-only in a
`skill test` run, so such a setup fails before the model starts. The warning names the case, the script, and the line,
and points at the tracked `hooks/` folder with `git config --global core.hooksPath "$PWD/hooks"`.
