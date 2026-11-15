---
"cyber-agentkit": patch
---

A `skill test` run whose shell changes into its plugin copy keeps running shell commands. Before, Claude Code's
sandbox failed every later command with `bwrap: Can't create file at …: Read-only file system`, unless
`CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` reset the folder first. Each copy now holds ahead every path the sandbox
mounts over, and keeps its git folder outside itself.
