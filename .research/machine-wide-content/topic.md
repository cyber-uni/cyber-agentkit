# Machine-wide and managed agent content (October 2026)

## Question

Does any agent harness keep plugins or skills machine-wide instead of per user? Where a harness
supports a managed tier, where does that tier's content live?

## Scope

In scope: skills, plugins and extensions, instruction files, custom agents, commands, and MCP
definitions, for the 13 harnesses in `harness-detection`, plus Amp and Windsurf/Devin as found.
Out of scope: managed policy settings files (see `harness-detection` R3). Goose and Roo Code were
not checked.

## Source angles

- Vendor docs for each harness.
- Source code of the open-source harnesses at pinned commits.
- The installed Claude Code and Copilot CLI binaries on this machine.

## Findings

### Machine-wide skill folders exist in three harnesses

Claude Code (E-MW-CC-2), Codex (E-MW-CODEX-1, E-MW-CODEX-2), and OpenCode 2.x (E-MW-OC-2, E-MW-OC-4).
Claude Code also reads managed agents, `CLAUDE.md`, and MCP from that folder; OpenCode also reads
agents, commands, and local plugins.

### Machine-wide instructions without skills

Amp (E-MW-OTHER-1) and Windsurf/Devin rules (E-MW-OTHER-3).

### Plugin files stay per user

Claude Code (E-MW-CC-7, E-MW-CC-9), Copilot CLI (E-MW-COPILOT-3), Codex (E-MW-CODEX-6), Gemini and
Qwen (E-MW-QWEN-3), OpenCode npm plugins (E-MW-OC-5). Claude Code's seed folder (E-MW-CC-8) is the
only admin-filled plugin store, and it has no default path.

### Server-delivered content

Copilot (E-MW-COPILOT-5, E-MW-COPILOT-6, E-MW-VSC-4), Cursor (E-MW-CUR-2, E-MW-CUR-4), Cline
(E-MW-CLINE-1), OpenHands (E-MW-OH-2), Kilo (E-MW-KILO-3), Gemini (E-MW-GEM-4).

## Contradictions

- None between sources. OpenCode's evidence is from 2.x `main`; 1.x was not read.

## Open questions

- Q1. Does Claude Code read `commands/` or `rules/` from its managed folder?
- Q2. Does Codex on Windows load `%ProgramData%\OpenAI\Codex\skills`?
- Q3. Can a Codex user disable ADMIN skills through `skills.config` rules?
- Q4. Where do Cursor required plugins and Copilot VS Code managed plugins land on disk?
- Q5. Did OpenCode 1.x scan its managed folder for skills?
- Q6. Where do Cline org MCP servers land, and how do org rules rank?
- Q7. Do Goose or Roo Code have machine-wide skill folders?

## Sources consulted

See `evidence.md`.
