# AGENTS.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Feature Planning

Use GitHub issues for feature planning by default. At the end of a brainstorming or design session, create a GitHub issue (via the `create-issue` skill) to capture the spec. Reference the issue number when resuming work in a future conversation.

## Commit Discipline

**Auto-commit rule:** When a unit of work is complete and verified, commit it immediately. Do not wait for the user to ask. Batching multiple units into one commit, or finishing all work before committing, are both violations of this rule.

**Unit of work:** one coherent, independently revertable change. That means one domain's refactor, one feature, one bugfix, one test suite expansion for one concern, or one config change. Never two unrelated concerns in the same commit. A TDD red-green-refactor cycle alone is not a commit boundary; commit when the full intended change is complete and tests pass. If the working tree has unrelated changes, leave them unstaged, commit the current unit first, then continue.

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- One concern per commit; never batch unrelated changes
- Stage only files for this unit: `git add <files>`, then verify with `git diff --cached`
- Never use `git add .`, `git add -A`, or `git add -p` (interactive commands agents cannot run)
- Never commit with red tests; run validation commands first

### References

- **`commit-work` skill.** Staging, splitting, and message writing when committing.

## Skill Augmentations

When loading any skill, also check `.agents/skills/<name>/SKILL.md` for project-level additions and merge them with the base skill. Files in `.agents/skills/` extend (not replace) the installed skill.

## Project overview

`cyber-agentkit` is an agent-harness-agnostic toolkit. It provides the fundamental features agent tools
need and makes each one work the same way across harnesses (Claude Code, Cursor, Codex, GitHub Copilot
CLI, and more). Today that is detecting which harness is running and querying what it holds, checking
the plugins another plugin depends on, resolving named reference documents layered across the managed,
project, user, and plugin tiers, and leasing git worktrees to concurrent sessions. It depends on no
other agent-layer package; ordinary npm libraries are fine. It exists so `universal-plugin`,
`buddy-agent-harness`, `repobuddy`, and `cyberlegion/cyber-mux` share one implementation instead of
each solving these per harness on their own.

The library is published to npm from `packages/agent-kit` as `cyber-agentkit`. It also ships as an
agent plugin of the same name, like `universal-plugin` does for itself.

Research comes before code: every harness fact the library encodes rests on
`.research/harness-detection`. The library must not claim to detect a harness it has not verified.

## Where things live

| Path | Holds |
| --- | --- |
| `packages/agent-kit/src` | Library source, one folder per domain concept |
| `packages/agent-kit/AGENTS.md` | Architecture rules for the library source |
| `.research/<topic-slug>` | Vendor findings, one folder per topic |
| `apps/web` | The documentation site. Each package gets `src/content/docs/packages/<package>/` with `index.md`, `install.md`, and `library.md` written by hand. `skills/`, `cli/`, and `requires.md` (only when `.claude-plugin/plugin.json` declares `dependencies`) are generated (gitignored) by `apps/web/scripts/generate-package-docs.mjs` from `plugin.json`, `skills/`, and the built CLI's help; editorial examples live in `apps/web/docs-data/<package>.json`. Internal links in Markdown carry the `/cyber-agentkit` base. |

## Research structure

Each topic under `.research/<topic-slug>/` holds four files:

- `conclusion.md`. The current best answer. Read this first.
- `topic.md`. The full investigation record.
- `evidence.md`. Claims logged with source URLs and confidence.
- `changes.md`. Dated update history.

A claim about a vendor decays, so check `evidence.md` for the source URL and re-verify against
vendor documentation before you rely on one.

<!-- buddy-agent-harness:begin -->

Skills are canonical in `.agents/skills/` — create and edit them there.
`.claude/skills/` is a generated bridge to it; never write to it directly.
This file is the one home for shared instructions; every harness reads it.

<!-- buddy-agent-harness:end -->
