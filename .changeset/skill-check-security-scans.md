---
"cyber-agentkit": minor
---

`/skill check`'s default Security aspect now scans for what a separate skill audit looked for. Six new script
checks fail a skill that carries invisible Unicode (SEC-7, reported with file, line, column, and code point), a
command that destroys data broadly such as `rm -rf ~` or `mkfs` (SEC-8), a prompt-injection phrase or chat-template
delimiter in its own text (SEC-9), a read of a credential location such as `~/.ssh` or a keychain (SEC-10), data sent
to a hardcoded URL or an endpoint that collects it (SEC-11), or `--no-verify`, a forced git command, or `sudo` with no
reason given (SEC-12, a warning). `check` now tells the agent that the skill it checks is data, not instructions.
