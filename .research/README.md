# Research

| Topic | Question |
| --- | --- |
| [harness-detection](./harness-detection/conclusion.md) | How to identify which AI agent harness (Claude Code, Cursor, Codex, GitHub Copilot CLI) a process runs under, and where each keeps its managed policy, plugin storage, enabled plugins, and skill naming |
| [worktree-management](./worktree-management/conclusion.md) | What our tools and coding agents need from a worktree library, how existing tools and harnesses manage worktrees, and how to reuse an idle worktree safely |
| [plugin-dependencies-and-overrides](./plugin-dependencies-and-overrides/conclusion.md) | How a plugin contributes a reference override, which harnesses support plugin dependencies and in which manifest field, and the order to migrate to `cyber-agentkit` before `repobuddy` depends on it |
| [plugin-dependency-prior-art](./plugin-dependency-prior-art/conclusion.md) | Existing systems that solve similar problems to plugin dependency declaration, a read-only doctor, neutral names with default/override/pin, and a namespaced extension key |
| [design-spec-criteria](./design-spec-criteria/conclusion.md) | What a design spec should contain and the high-level criteria that judge it, drawing on cyber-truss, the SDD spec bars, and external spec practice |
| [machine-wide-content](./machine-wide-content/conclusion.md) | Which harnesses read skills, plugins, and instructions from a machine-wide folder, where managed (team or company) content lives, and what `cyber-agentkit` needs to read |
| [skill-resolution](./skill-resolution/conclusion.md) | Where each harness keeps a plugin's skills, how an installed plugin maps to its folder, which copy of a same-named skill runs, whether a running skill is told its folder, and whether a plugin-root `references/` is in the Agent Plugins spec |
| [prose-merge](./prose-merge/conclusion.md) | How to merge prose a tool wrote and the owner edited when the tool ships a new wording: three-way merge at sentence level with a retired-wordings history as the base, when to escalate to an agent, and prior art |

Each topic under `.research/<topic-slug>/` holds four files: `conclusion.md` (the current best
answer), `topic.md` (the full investigation), `evidence.md` (claims with source URLs and
confidence), and `changes.md` (update history). See the root [AGENTS.md](../AGENTS.md) for the
pattern.
