---
"cyber-agentkit": major
---

References are read from the repository root: the nearest folder at or above the working folder holding `.git` (a folder or a file, so a git worktree counts), else the working folder; `pnpm-workspace.yaml` and `workspaces` no longer mark it, and a `--root` (or library `root`) that does not exist fails with `root-missing`. The root's `.agents/references/` is the new `repo` tier, replacing the chain of `project` folders from the working folder up, and `--scope project` is gone (`--scope repo` is the default; `projectReferencesDir` is now `repoReferencesDir`). A managed folder is read only when harness detection names exactly one harness, and dependency plugins come only from the root's `package.json`; each plugin layer now records its `origin` and installed `version`.
