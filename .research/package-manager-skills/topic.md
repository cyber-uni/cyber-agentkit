# Skills installed by package managers (October 2026)

## Question

Which folders do pnpm and the `skills` CLI (`npx skills`) write standalone skills into, project and user level,
and which of Claude Code, Cursor, Codex CLI, GitHub Copilot CLI, OpenCode, and Gemini CLI read those folders?

## Scope

In scope: pnpm's agent-skills feature, the `skills` CLI add and sync commands, and project and user skill folders
of six harnesses. Out of scope: plugin installs, other package managers, and managed or admin tiers (see
`machine-wide-content`).

## Source angles

- pnpm: GitHub releases, PR #16744 and #16773, RFC pnpm/rfcs#35, docs and Rust source at `78943e0`.
- `skills`: README, `docs/commands.md`, `docs/agents.md`, `src/installer.ts`, `src/agents.ts`, `src/sync.ts`
  at `a80e4c9`; npm registry metadata.
- Vendor docs for each harness; `harness-detection` R6 as the prior record.

## Findings

### pnpm

The user's premise was close but not exact. pnpm 12.11.0 (2026-10-09) links skills that direct dependencies ship
under `skills/<name>/SKILL.md`. The package must be approved first (`pnpm approve`, stored as
`permissions.<pkg>.skills: true`). Links are named `pnpm-<package>-<skill>` and point into `node_modules`. Targets
are the `.*/skills` folders that already exist at the workspace root, plus the folder of the agent identified by an
environment variable, or `skills.dirs`. See E-PM-PNPM-1 to -11.

### skills CLI

`skills add` copies once into `.agents/skills/<name>` and symlinks other agents' folders to it; global installs go
to `~/.agents/skills`. Cursor, Gemini CLI, Copilot, OpenCode, and Codex count as "universal" and read the canonical
folder, so no link is made for them. `experimental_sync` reads installed npm dependencies and links their skills
the same way. See E-PM-SK-1 to -7.

### Harness folders

All six vendor pages were re-fetched and match `harness-detection` R6. See E-PM-H-1 to -6, E-PM-X-1.

## Contradictions

- `skills` docs versus its source on global paths (E-PM-SK-4, -5). The source was followed.
- No contradiction with `harness-detection`.

## Open questions

- Which env vars each harness really sets (pnpm's map is partly unverified).
- Whether `skills sync` has a global mode.
- Run-time behavior: nothing was executed.

## Sources consulted

- https://github.com/pnpm/pnpm/releases/tag/v12.11.0
- https://github.com/pnpm/pnpm/pull/16744 , /pull/16773 , /pull/14995 , /issues/12701
- https://github.com/pnpm/rfcs/pull/35
- https://github.com/pnpm/pnpm/blob/78943e0/pnpm/docs/agent-skills.md
- https://github.com/vercel-labs/skills (commit `a80e4c9`) and https://www.npmjs.com/package/skills
- https://code.claude.com/docs/en/skills , https://cursor.com/docs/skills ,
  https://learn.chatgpt.com/docs/build-skills ,
  https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills ,
  https://opencode.ai/docs/skills , https://geminicli.com/docs/cli/skills/
