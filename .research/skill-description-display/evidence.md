# Evidence — Skill description display

Every claim below carries its source and the date it was checked. Confidence follows the definition
in [harness-detection](../harness-detection/evidence.md): **High** means a vendor page states it, or a
source read shows it unambiguously. **Medium** means it is read from a shipped bundle, or implied by a
vendor page, or the code does not show every step. **Low** means the evidence is indirect, such as user
reports.

## Claude Code

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-CC-1 | A user report says the slash picker cuts long descriptions at the terminal width with an ellipsis. Another says it hard-truncates to one line, even on a full-width window. A third (2026-06-17) says the palette clips each description to 2 lines. No vendor page states a menu length | https://github.com/anthropics/claude-code/issues/52009 , https://github.com/anthropics/claude-code/issues/31644 , https://github.com/anthropics/claude-code/issues/69005 | 2026-11-15 | reported (not vendor) | Low |
| E-CC-2 | The skills page documents no menu display length. It only says `user-invocable: false` hides a skill from the `/` menu | https://code.claude.com/docs/en/skills | 2026-11-15 | verified (negative) | High |
| E-CC-3 | "The combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing"; the cap is configurable with `skillListingMaxDescChars`. This is the listing the model sees | https://code.claude.com/docs/en/skills | 2026-11-15 | verified (docs) | High |
| E-CC-4 | The listing budget scales at 1% of the model's context window. When it overflows, descriptions are dropped starting with the least invoked skills. `SLASH_COMMAND_TOOL_CHAR_BUDGET` sets a fixed character count. Docs advise "put the key use case first" | https://code.claude.com/docs/en/skills (Skill descriptions are cut short) | 2026-11-15 | verified (docs) | High |
| E-CC-5 | A grep of the Claude Code 2.1.322 bundle for `descriptionTruncat` and `MAX_LISTING_DESC_CHARS` returned no match, so the bundle gave no menu number | direct experiment: `grep -aoE` on the Agent SDK `claude` 2.1.322 binary, one run | 2026-11-15 | negative result | Low |

## Codex CLI

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-CODEX-1 | The mention popup passes the description through with only an empty filter. Only the display name is cut, to 28 characters. A test shows the description hidden at width 32 and shown at width 72 | https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/skill_popup.rs | 2026-11-15 | verified (source) | High |
| E-CODEX-2 | The popup row renderer builds one full row and cuts the whole row to the area width with an ellipsis. The description column starts at no more than 70% of the width. No character-count constant | https://github.com/openai/codex/blob/main/codex-rs/tui/src/bottom_pane/selection_popup_common.rs | 2026-11-15 | verified (source, excerpt read via fetch) | High |
| E-CODEX-3 | The skills list given to the model "uses at most 2% of the model's context window, or 8,000 characters when the context window is unknown". Codex shortens descriptions first, may drop skills, and shows a warning. `skills.max_context_tokens` raises it up to 10,000 tokens. No numeric per-description limit. Docs advise front-loading the key use case | https://learn.chatgpt.com/docs/build-skills (redirect from https://developers.openai.com/codex/skills) | 2026-11-15 | verified (docs) | High |

## Cursor

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-CUR-1 | The skills page states no description length limit, no truncation, and no menu display length. It says only that skills can be invoked by typing `/` in Agent chat | https://cursor.com/docs/skills | 2026-11-15 | verified (negative) | High |

## GitHub Copilot CLI

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-COP-1 | The "add skills" page requires `description` and states no length limit, no truncation, and no menu behaviour. A web search found no vendor page that does | https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills | 2026-11-15 | verified (negative) | Medium (one page plus a search) |

## Gemini CLI

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-GEM-1 | The skills doc states no description length limit and does not say how skills show in the slash menu. It documents `/skills` | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md | 2026-11-15 | verified (negative) | Medium |
| E-GEM-2 | The suggestions list renders `sanitizeForDisplay(suggestion.description, 100)` with `wrap="truncate"`. `sanitizeForDisplay` cuts to `maxLength - 3` code points plus `...`. Not shown that skills use this list | https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/components/SuggestionsDisplay.tsx , https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/ui/utils/textUtils.ts | 2026-11-15 | verified (source, via fetch summary) | Medium |
| E-GEM-3 | No cap on the description the model sees was found in the skills doc | https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md | 2026-11-15 | verified (negative) | Medium |
