# Conclusion — Skills installed by package managers (October 2026)

## Last updated

2026-10-20. Versions checked: pnpm 12.14.0 (feature added in 12.11.0, docs at `78943e0`); `skills` (npm) 1.7.4 at
vercel-labs/skills `a80e4c9`; vendor docs fetched 2026-10-20 for Claude Code, Cursor, Codex, GitHub Copilot CLI,
OpenCode, and Gemini CLI.

## Question

When a project depends on a standalone skill, installed by a package manager (pnpm, `npx skills`) instead of a
plugin, which folder does the skill land in, and which harnesses read that folder? The answer feeds the reference
spec's rule that a skill's default documents sit at `<skill>/references/<name>.default.md` in the skill folders
the detected harness reads (spec Q12, R58).

## Verdict

1. pnpm does ship this, but it differs from the premise in four ways. It is pnpm 12.11.0 or later only
   (E-PM-PNPM-1, -2, -3). It is on by default but gated by `pnpm approve` (E-PM-PNPM-7). The link name is
   `pnpm-<package>-<skill>`, not `pnpm-<skill>` (E-PM-PNPM-4). It does not target `.agents/skills` by default: it
   links into the `.*/skills` folders that already exist at the workspace root, plus the folder of the agent that
   runs pnpm, or whatever `skills.dirs` lists (E-PM-PNPM-5). So it can write `.claude/skills`, `.cursor/skills`,
   `.gemini/skills`, `.github/skills`, and `.agents/skills`, depending on the project (E-PM-PNPM-6).
2. A skill in a package is `skills/<name>/SKILL.md`, one level deep. There is no `package.json` field
   (E-PM-PNPM-9). Project scope only; global installs never link skills (E-PM-PNPM-8).
3. `npx skills add` puts a real copy in `.agents/skills/<name>` (project) or `~/.agents/skills/<name>` (`-g`) and
   symlinks each non-universal agent's folder to it; `--copy` copies instead (E-PM-SK-1, -2). Folder name is the
   skill's own sanitized name (E-PM-SK-6). `npx skills experimental_sync` does the npm-dependency job and also
   uses `.agents/skills/` (E-PM-SK-7).
4. Every folder these tools write is read by at least one of the six harnesses, and `.agents/skills` is read by
   five of them at project level and by all but Claude Code at user level (table below). Claude Code reads only
   `.claude/skills` (E-PM-H-1, E-PM-PNPM-11).
5. For the library: a skill found through a package manager may sit under any of the folders in the table, as a
   symlink, and under a folder name that is not the skill name (`pnpm-<package>-<skill>`). Locate a skill by the
   `name` in its `SKILL.md`, follow symlinks, and do not assume the folder name equals the skill name.

## Reference material

Project scope is the repository (harnesses also walk up to the repository root). User scope is the home directory.

| Tool or harness | Project folder(s) | User folder(s) | Evidence |
| --- | --- | --- | --- |
| pnpm 12.11+ (writes) | existing `.*/skills` at workspace root; env-chosen one; or `skills.dirs`; names `pnpm-<pkg>-<skill>` | none (no global) | E-PM-PNPM-5, -6, -8 |
| `skills add` (writes) | `.agents/skills/<name>` real; `<agent dir>/<name>` symlink if that agent's dir exists | `~/.agents/skills/<name>`; Claude Code also `~/.claude/skills` | E-PM-SK-1, -2, -4 |
| `skills experimental_sync` (writes) | `.agents/skills/` plus selected agent dirs, symlinks into `node_modules` | not documented | E-PM-SK-7 |
| Claude Code | `.claude/skills` | `~/.claude/skills` | E-PM-H-1 |
| Cursor | `.agents/skills`, `.cursor/skills`, `.claude/skills`, `.codex/skills` | same four under `~` | E-PM-H-2 |
| Codex CLI | `.agents/skills` (cwd up to repo root) | `~/.agents/skills`; admin `/etc/codex/skills` | E-PM-H-3 |
| GitHub Copilot CLI | `.github/skills`, `.claude/skills`, `.agents/skills` | `~/.copilot/skills`, `~/.agents/skills` | E-PM-H-4 |
| OpenCode | `.opencode/skills`, `.claude/skills`, `.agents/skills` | `~/.config/opencode/skills`, `~/.claude/skills`, `~/.agents/skills` | E-PM-H-5 |
| Gemini CLI | `.gemini/skills`, `.agents/skills` (alias wins) | `~/.gemini/skills`, `~/.agents/skills` | E-PM-H-6 |

Which writer reaches which reader, project scope:

- `.agents/skills`: read by Cursor, Codex, Copilot CLI, OpenCode, Gemini CLI. Not read by Claude Code.
- `.claude/skills`: read by Claude Code, Cursor, Copilot CLI, OpenCode. Not read by Codex or Gemini CLI.
- `.github/skills` (pnpm for Copilot): read by Copilot CLI only among the six.
- `.cursor/skills` and `.gemini/skills`: each read by its own harness only (Cursor; Gemini CLI).

Two implementation notes for the resolver:

- `skills add` targets a harness by name, so for Claude Code the skill is in `.claude/skills` only when that
  folder already exists in the project (E-PM-SK-2). A project that ran `skills add` with no `.claude/` folder has
  the skill in `.agents/skills` alone, which Claude Code does not read. That is the tool's behavior, not the
  library's to fix.
- pnpm's and `skills sync`'s entries are symlinks into `node_modules`; `skills add` entries in `.claude/skills`
  are symlinks to the canonical copy. A resolver that skips symlinks would miss them.

## Confidence

High that the facts in the table match the vendor docs and source on 2026-10-20 (docs and source agree for pnpm
and for `skills`; six harness docs re-fetched and match `harness-detection` R6). Medium for how the tools behave
at run time: nothing was run, pnpm and `skills` were read from docs, PRs, and source.

## Strongest supporting evidence

- pnpm's own docs page, release notes, and Rust source (`targets.rs`, `agent_skills.rs`) agree on version,
  naming, and targets (E-PM-PNPM-1 to -6).
- `skills` source (`installer.ts`, `agents.ts`) matches its commands doc on canonical folder and symlink mode
  (E-PM-SK-1, -2, -3).
- A maintainer test in pnpm PR #14995 shows Claude Code reading `.claude/skills` and not `.agents/skills`, while
  Codex reads the reverse (E-PM-PNPM-11), matching the vendor docs.

## Strongest weakening evidence

- E-PM-SK-5: `skills` docs list `~/.config/agents/skills/` as the universal global path, but the installer writes
  `~/.agents/skills/`. The docs table's "Global Path" column also overstates where `-g` writes for Cursor, Gemini
  CLI, Copilot, and OpenCode (E-PM-SK-4). This conclusion follows the source.
- E-PM-PNPM-6: the env-var-to-folder map is partly unverified by pnpm's own authors.

## Not supported

- That pnpm hoists skills into `.agents/skills/pnpm-<skill name>/` by default. It does so only when that folder
  exists, `skills.dirs` lists it, or an env var such as `CODEX_THREAD_ID` or `AI_AGENT` is set, and the folder name
  carries the package name.
- Any pnpm skills support before 12.11.0, or in pnpm 10 and 11 (E-PM-PNPM-3, -10).
- A `package.json` field that marks a skill (E-PM-PNPM-9).
- Global (user-level) skills from pnpm (E-PM-PNPM-8).

## Where evidence is thin

- Whether the environment variables pnpm tests are really set by each harness (only `CLAUDECODE` is claimed
  verified). If a variable is absent, pnpm links only into folders that already exist.
- Global `skills experimental_sync`: no global mode was found in docs or source read; not tested.
- Windows paths and `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `XDG_CONFIG_HOME` overrides: `skills` honors them in
  `agents.ts`, but the harness docs for user-level paths were not checked for the same overrides.
- Other package managers (npm, yarn, bun) and other skill CLIs were not searched.
- The Claude Code `.claude/skills` only claim rests on one docs page plus one maintainer test (version unstated).

## Contradictions with `harness-detection`

None found for the six harnesses; R6 rows match on 2026-10-20. One related item: R6 notes the `vercel-labs/skills`
registry lists Cline as a `.agents/skills` reader. This topic's `skills` table agrees (Cline uses `.agents/skills`)
but the registry's global column for Gemini CLI and Cursor (native folders) is not where `-g` writes (E-PM-SK-4);
R6's user-level rows come from vendor docs and stay correct.

## Check again later

- pnpm: whether the default target set grows to include `.agents/skills` without the folder existing, and
  whether pnpm 11 gets a backport. Re-read https://pnpm.io/agent-skills and the release notes.
- `skills`: `experimental_sync` is experimental and may rename or move; re-read `docs/commands.md`.
- Claude Code: whether it ever adds `.agents/skills` (it did not as of 2026-10-20).
- Re-run the pnpm PR #14995 style probe against current Claude Code and Codex builds.
