---
'cyber-agentkit': patch
---

Stop `reference` from reading every folder below a working folder that is not a git repository. Outside git, project
folder discovery walked the whole tree, so from a folder of many clones `load`, `list`, and `search` read each clone's
`.git`, `node_modules/`, and package store and took minutes. The walk now stops at a folder holding `.git`, a nested
repository or worktree with its own root, as `git ls-files` does inside a repository, and never enters a `.git` folder.
