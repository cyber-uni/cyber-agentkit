# Changes

## 2026-09-26 — created

Opened for [cyberuni/agent-harness#1](https://github.com/cyberuni/agent-harness/issues/1), covering
R1–R5 for Claude Code, Cursor, Codex, and GitHub Copilot CLI.

Corrections made before the topic was first committed, after checking the first pass against
vendor sources:

- Copilot CLI managed policy. The first pass said no local file exists. GitHub documents
  `managed-settings.json` paths for Linux, macOS, and Windows, plus MDM and server-managed delivery.
  E-COPILOT-M1 to M4 were rewritten.
- Copilot CLI detection variables. `COPILOT_CLI=1`, `COPILOT_AGENT_SESSION_ID`, and
  `COPILOT_PLUGIN_ROOT` were raised from observed-but-undocumented to High on the strength of the
  vendor changelog.
- Cursor detection. `CURSOR_AGENT` was raised to High on the strength of Cursor's terminal page.
- Codex detection. `CODEX_COMPANION_*` were reattributed to the parent Claude Code session.
  `CODEX_CI=1` was confirmed in source.
- Removed account-identifying values (a team id and team name) from E-CUR-M2.

## 2026-09-26 — Copilot CLI slash form sourced

Added E-COPILOT-S6, GitHub's own statement that a skill is invoked by its name after a forward
slash, so the `/<skill>` form in R4 no longer rests on the `skill list` output alone.

## 2026-09-26 — Cursor IDE agent

Read the Cursor IDE's shipped code (3.18.9) to settle whether its agent sets `CURSOR_AGENT=1`. It
does, on agent terminals and agent shell commands (E-CUR-D11). The IDE's MCP servers do not get it,
and only the CLI exports `CURSOR_INVOKED_AS` (E-CUR-D12). Detection needs no change: both report
`cursor`. The open question is narrowed to confirming this in a live IDE session.

## 2026-09-26 — wave 1 of #6

Added OpenCode, Kilo Code, Gemini CLI, Qwen Code, GitHub Copilot in VS Code, and Cline to R1–R5
(E-OC, E-KILO, E-GEM, E-QWEN, E-VSC, E-CLINE), and checked the survey's reported retirements
(E-RET). Every wave-1 harness has a verified detection signal. Corrections to the #6 leads:

- Qwen Code does not set `GEMINI_CLI`, and its `QWEN_CODE` value is `1`, not empty.
- Kilo Code's own marker is `KILO=1`; `KILO_PID` replaces `OPENCODE_PID` rather than joining it.
- The VS Code release note's `VSCODE_AGENT` does not exist; the variable is `COPILOT_AGENT`.
- Aider is stalled, not discontinued.

Corrected before commit: the first pass missed the `GEMINI_CLI_HOME` and `QWEN_HOME` overrides and
the XDG config path of OpenCode and Kilo Code (E-GEM-P2, E-QWEN-P4, E-OC-P4, E-KILO-P4).

## 2026-09-27 — wave 2 of #6

Added Crush, Goose, OpenHands, the Auggie CLI, Antigravity, and Rovo Dev to the evidence (E-CRUSH,
E-GOOSE, E-OH, E-AUG, E-AGY, E-ROVO), and re-checked detection for Kiro, Amp, Factory Droid, Devin
Desktop, and Warp (E-KIRO, E-AMP, E-DROID, E-DEVIN, E-WARP). Crush, OpenHands, and the Auggie CLI
(hooks only) have verified signals. The other eight are recorded under "Wave 2: no verified signal"
in the conclusion. Corrections to the #6 leads:

- Goose's documented `GOOSE_TERMINAL=1` is set only on recipe check commands, not on the shell tool.
- OpenHands has no `OPENHANDS=1`; it marks shell commands with `AI_AGENT=openhands`.
- Crush sets `CRUSH=1` beside the shared `AGENT` and `AI_AGENT`.
- Goose moved to `aaif-goose/goose`; OpenHands' runtime moved to `OpenHands/software-agent-sdk`.

Corrected before commit: the hook-executor line anchor in E-OH-D4, and Factory Droid's npm package,
which is `droid`, not `factory-cli`.

## 2026-09-28 — skill directories (R6)

Added where each harness reads skills (E-CC-L1, E-CUR-L1, E-CODEX-L1, E-GEM-L1, E-KILO-L1), for
repobuddy/buddy-agent-harness#161, which moves its skills-path facts and its drift checks here.
E-GEM-L1 supersedes E-GEM-S1 on the directories: Gemini CLI also reads the `.agents/skills` alias
at both scopes, and the alias wins a name clash. E-KILO-L1 carries over buddy-agent-harness's
E-KILO-01: the documented `.agents/skills` is disputed, so Kilo Code's directories stay unconfirmed.
Re-checked Cline's docs: they still name no `.agents/skills` path, although `vercel-labs/skills`
lists Cline as universal.

## 2026-09-28 — installed plugin folders (R7)

Added R7 for [#38](https://github.com/cyberuni/agent-harness/issues/38). Read Codex's active-version
rule from source at rust-v0.153.4 (E-CODEX-P8). Installed a marketplace plugin, a direct plugin, and
a local-marketplace plugin into scratch `COPILOT_HOME` folders with Copilot CLI 1.0.88 and recorded
the `config.json` install record (E-COPILOT-P10–P12). E-COPILOT-P13 qualifies E-COPILOT-P2: the XDG
split read from the bundle did not move a plugin install out of `~/.copilot`.

## 2026-09-28 — R8 instruction files and the vendor-docs drift watch

For [#36](https://github.com/cyberuni/agent-harness/issues/36). Added R8, the instruction files each
harness reads, one row per harness from its vendor docs (E-CC-I1, E-CUR-I1, E-CODEX-I1,
E-COPILOT-I1, E-VSC-I1, E-OC-I1, E-KILO-I1, E-GEM-I1, E-QWEN-I1, E-CLINE-I1, E-CRUSH-I1, E-OH-I1,
E-AUG-I1). Kilo Code's and VS Code's pages were fetched from the docs source in the vendor's own
repository, since their sites serve no markdown.

E-OC-S1 now also cites the published opencode.ai skills page, which names the same directories as
the pinned source it was read from.

Re-checked Gemini CLI's skills page against the open registry finding: it names the `.agents/skills`
alias for both tiers, so E-GEM-L1 stands and the finding is closed.

The new drift watch surfaced two skills-axis disagreements, recorded under "Drift watch" in the
conclusion and left open for research: the Auggie CLI and Kilo Code skills pages now name more
directories than E-AUG-S1 and E-KILO-L1 record.

## 2026-09-28 — live captures for #33

Captured the OpenHands CLI 1.16.0 live (E-OH-D9–D11). A local mock LLM drove one terminal command
and one hook, so no model account was needed. This corrects E-OH-D7:

- The CLI's terminal commands carry no `AI_AGENT`. The CLI pins SDK 1.21.0, and the SDK started
  setting `AI_AGENT=openhands` in 1.40.1.
- The CLI's hook commands carry `OPENHANDS_EVENT_TYPE` and `OPENHANDS_PROJECT_DIR`, so the hook rule
  still detects them.

The detection rules are unchanged. What changed is which OpenHands builds the `AI_AGENT` rule
reaches.

## 2026-09-28 — live capture attempt for #33

Tried to capture live environments for the nine harnesses in "Wave 2: no verified signal". None
could be run from this research's WSL machine: no CLI was installed, and Antigravity IDE and Warp
were installed only as Windows GUI apps, which an agent cannot drive. This attempt added no evidence
rows and changed no detection rule. Added a capture protocol to [topic.md](./topic.md) so a person at
each harness can record a comparable capture. Its OpenHands row points at the CLI capture above.

## 2026-10-04 — R9 headless invocation

For [cyberuni/cyber-sdd#69](https://github.com/cyberuni/cyber-sdd/issues/69), which moves a
headless agent runner into ACED. Added R9 and the `H` evidence rows: Claude Code 2.1.289 and Codex
0.159.3 from vendor docs, local `--help`, and Codex source; Copilot CLI 1.0.90 and cursor-agent
2026.09.28 from docs and local help; Gemini CLI and Qwen Code from their docs in the vendor repos.
Confirmed by direct experiment that Claude Code rejects `--output-format stream-json` without
`--verbose` (E-CC-H4), and read Codex's session path from source at 4ad985e (E-CODEX-H4). OpenCode,
Kilo Code, Cline, Crush, OpenHands, and the Auggie CLI have one-shot modes but stay `unknown` until
their pages are read directly.

## 2026-10-04 — skills drift from #43

For [#43](https://github.com/cyberuni/agent-harness/issues/43), the drift check's report. Checked
each finding against the vendor:

- Auggie CLI. Its skills page now lists `.augment/skills`, `.claude/skills`, and `.agents/skills`,
  project and user, in that precedence (E-AUG-S4). `skillsDirectories('augment')` now returns all
  three.
- Kilo Code. The page and the source at main agree on `.kilo/skills`, `.agents/skills`, and
  `.claude/skills` at both scopes, and the tracker bug about global `.agents` skills was fixed
  (E-KILO-L2, superseding the contested E-KILO-L1). `skillsDirectories('kilo')` no longer returns
  `undefined`. `.github/skills` and `.well-known/skills` on the page are config examples, not
  defaults.
- Cline. The registry's `.agents/skills` is right: both Cline clients read it at both scopes,
  though the docs still do not name it (E-CLINE-S3). `skillsDirectories('cline')` now includes it,
  and the drift baseline gained `sourceBacked` so a source-only directory is not reported as
  undocumented.

Seen on the way, not yet researched: Kilo's skills page now says every skill is a slash command,
against E-KILO-S2.

## 2026-10-04 — Kilo skills are slash commands

For [#56](https://github.com/cyberuni/agent-harness/issues/56). Checked the lead from #43 against
Kilo's skills page and the source at main (76bcfd4). Both products register every loaded skill as a
slash command under its bare name; on a clash with a custom command or MCP prompt the skill becomes
`/<skill>:skill` (E-KILO-S3). That supersedes E-KILO-S2. Prose invocation still works.
`skillInvocation('kilo')` now returns `/<skill>`, not namespaced.

## 2026-10-20 — skill-resolution cross-references

`.research/skill-resolution` (#114) settled two open questions here: Cursor keeps per-plugin enabled state on its
server, and two Codex plugins' same-named skills are told apart by a `<plugin>:` prefix. It also found R4 and R6 rows
that need correcting (Codex and Copilot CLI plugin skill namespacing, Cursor's `.grok/skills`, Copilot CLI's
conditional `~/.agents/skills`). A note under R4 points to them; the tables and `skillsDirectories()` are not changed
here, since that is library work.
