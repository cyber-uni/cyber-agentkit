# Conclusion — Skill description display (November 2026)

## Last updated

2026-11-15. Versions checked: Claude Code 2.1.322 (the bundle grep found nothing, see topic.md), docs read
on 2026-11-15. Codex source read at openai/codex `main`, Gemini CLI source at google-gemini/gemini-cli
`main`, both on 2026-11-15.

## Question

How many characters of a skill's or custom command's `description` does each harness show in its slash
menu or skill picker before it truncates? Also, what cap does each harness put on the description the
model sees? Tracked in [#238](https://github.com/cyber-uni/cyber-agentkit/issues/238).

## Verdict

**No harness documents a menu character count.** Where the code or reports show a rule, the menu cuts
the description to the terminal width, so the visible length depends on the window, not on a fixed
number. The one fixed number found is in Gemini CLI source, and it is a 100-character cap in a
suggestion list that was not shown to be the slash menu.

## Menu display

| Harness | Menu display length | Evidence | Confidence |
| --- | --- | --- | --- |
| Claude Code | Not documented. Users report the menu clips to the terminal width (one line, with an ellipsis) or to two lines, depending on version | E-CC-1, E-CC-2 | Low |
| Codex CLI | Not a character count. One row per entry, cut to the terminal width with an ellipsis. The description column is hidden when the window is narrow | E-CODEX-1, E-CODEX-2 | High (source) |
| Cursor | Not documented | E-CUR-1 | High (that the docs are silent) |
| GitHub Copilot CLI | Not documented | E-COP-1 | Medium |
| Gemini CLI | Not documented for skills. The suggestion list cuts a description to 100 characters and to one line | E-GEM-1, E-GEM-2 | Medium |

## What the model sees

Kept apart from the menu number. These caps limit the listing in context, not the menu.

| Harness | Cap on the description the model sees | Evidence | Confidence |
| --- | --- | --- | --- |
| Claude Code | 1,536 characters for `description` plus `when_to_use` per skill. The whole listing has a budget of 1% of the context window, and the least used skills lose their descriptions first | E-CC-3, E-CC-4 | High |
| Codex CLI | The whole skill list uses at most 2% of the context window, or 8,000 characters when the window is unknown. Descriptions are shortened first. No per-description number | E-CODEX-3 | High |
| Cursor | Not documented | E-CUR-1 | High (that the docs are silent) |
| GitHub Copilot CLI | Not documented | E-COP-1 | Medium |
| Gemini CLI | Not documented | E-GEM-3 | Medium |

## Rule for writing descriptions

No verified number exists for the menu, so the rule must not state one as fact. The conservative rule:

- The first sentence says the most important thing the skill does, and it stands on its own.
- Keep that sentence short. As a working target, keep it under 100 characters. This is a conservative
  choice, not a verified limit: 100 is the only fixed menu number found (E-GEM-2), and a menu that cuts
  to the terminal width shows at least that much on a normal window (E-CC-1, E-CODEX-2).
- Put trigger words and detail after it. The model reads up to 1,536 characters on Claude Code
  (E-CC-3), and Codex shortens descriptions when its list is full (E-CODEX-3).

Do not write "the menu shows N characters" in guidance. Write "the menu shows only the start".

## Open questions

- Claude Code's exact menu rule in 2.1.322 is not confirmed from the shipped bundle.
- Whether Gemini CLI's 100-character cap applies to a skill in the slash menu.
- Cursor and Copilot CLI are closed source, so only a live check can settle them.
