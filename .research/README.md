# Research

| Topic | Question |
| --- | --- |
| [harness-detection](./harness-detection/conclusion.md) | How to identify which AI agent harness (Claude Code, Cursor, Codex, GitHub Copilot CLI) a process runs under, and where each keeps its managed policy, plugin storage, enabled plugins, and skill naming |
| [worktree-management](./worktree-management/conclusion.md) | What our tools and coding agents need from a worktree library, how existing tools and harnesses manage worktrees, and how to reuse an idle worktree safely |
| [plugin-dependencies-and-overrides](./plugin-dependencies-and-overrides/conclusion.md) | How a plugin contributes a reference override, which harnesses support plugin dependencies and in which manifest field, and the order to migrate to `uni-agent-kit` before `repobuddy` depends on it |

Each topic under `.research/<topic-slug>/` holds four files: `conclusion.md` (the current best
answer), `topic.md` (the full investigation), `evidence.md` (claims with source URLs and
confidence), and `changes.md` (update history). See the root [AGENTS.md](../AGENTS.md) for the
pattern.
