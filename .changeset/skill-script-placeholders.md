---
"cyber-agentkit": patch
---

`skill test`: a setup script or `script` check no longer sees the sandbox's `/dev/null` placeholders for `.bashrc`,
`.mcp.json`, `.vscode` and the like as new files, so a "nothing changed" `git status` check passes for a run that
wrote nothing. The sandbox now starts in an empty folder of its own, and still refuses writes to the run
repository's `.git/config` and `.git/hooks`.
