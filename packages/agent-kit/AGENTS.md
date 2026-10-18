# AGENTS.md — uni-agent-kit

No agent-layer dependencies. This package sits under the agent tools (`universal-plugin`,
`buddy-agent-harness`, `repobuddy`, `cyber-*`), so it must never depend on one of them or on
another agent-layer package. Ordinary npm libraries (`yaml`, `clibuilder`)
are fine, but the package declares no runtime `dependencies`: `yaml` is bundled into `dist`, the bin
bundles `clibuilder`, and it is an optional peer for `./commands` so a
consumer of `.` or `./worktrees` installs nothing extra. The root entry (`.`) keeps its published declarations free of `@types/node` and of
`clibuilder`; the clibuilder commands live behind the `./commands` subpath. Commands answer by
returning `result()` or `document()` from `clibuilder/axi`, and read the global `--format` as `this.format`;
`src/command-output` keeps only what clibuilder does not cover, and no subpath exports it.

## Screaming Architecture

Folders under `src/` are named after **domain concepts**, not technical roles. Add a new top-level
folder only when a new domain concept warrants it. Do not create generic folders like `src/utils/`
or `src/helpers/`.

## Facts about harnesses cite research

Any claim in this package's source or comments about what a harness does — a manifest path, a
policy file location, a naming convention — must trace back to `.research/harness-detection` (or a
later research topic that supersedes it). Do not encode a guess as a fact. Each encoded fact names
the evidence ID it rests on (for example `research: 'E-CC-D1'`), so a reviewer can check it against
`evidence.md`. When a signal is ambiguous, report `unknown` rather than guess.
