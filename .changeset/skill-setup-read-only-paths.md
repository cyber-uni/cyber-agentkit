---
'cyber-agentkit': patch
---

The setup script `skill case add --setup` scaffolds, and the `skill-design.aspects.verification` reference, now say
that a run's `.git/hooks` and `.git/config` are read-only and how to install a git hook anyway: a tracked `hooks/`
folder and `git config --global core.hooksPath "$PWD/hooks"` in the run's own empty home.
