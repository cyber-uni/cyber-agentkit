# Topic — Skill description display

## Why this topic exists

A rule is being added that a skill description's first sentence states the most important thing the
skill does, because harnesses show only the first part of the description in the slash menu.
Issue [#238](https://github.com/cyber-uni/cyber-agentkit/issues/238) asks how much they show, so the
rule does not claim a number nobody verified. The answer is in [conclusion.md](./conclusion.md).

## Question

For Claude Code, Codex CLI, Cursor, GitHub Copilot CLI, and Gemini CLI: how many characters of a
`description` does the slash menu or skill picker show before it truncates? Separately: what limit
applies to the description the model sees?

## Method

1. Read each vendor's docs for a stated limit.
2. For the open-source harnesses (Codex, Gemini CLI), read the TUI source for the popup or list.
3. For Claude Code, read the docs, then the user issue tracker for observed behaviour, then grep the
   shipped bundle (Agent SDK copy, version 2.1.322).
4. Mark a harness "not documented" when none of these gives a number.

## What was searched

- Claude Code: the skills page, the settings reference index, issues 31644, 42785, 52009, 69005 in
  anthropics/claude-code (via `gh`), and one bundle grep for `descriptionTruncat` and
  `MAX_LISTING_DESC_CHARS`.
- Codex: the TUI files `skill_popup.rs` and `selection_popup_common.rs`, a web search, and the skills docs.
- Cursor: the skills page.
- Copilot CLI: the "add skills" page and a web search.
- Gemini CLI: the skills doc, `SuggestionsDisplay.tsx`, and `textUtils.ts`.

## Results

- Claude Code documents only the model-side cap (1,536 characters, E-CC-3). Menu behaviour is known only
  from user reports, which differ by version (one line at terminal width, later two lines).
- Codex cuts each row to the terminal width. There is no character constant (E-CODEX-2).
- Cursor and Copilot CLI document nothing on this.
- Gemini CLI source caps a suggestion description at 100 characters, but the link to skills was not shown.

## Limits of this record

Source files for Codex and Gemini were read through a fetch tool that summarises the file, not by
cloning the repository. The code was not run. Dates are the check date, not a release date.

## Open questions

- Confirm Claude Code's menu rule from a live session or the bundle.
- Confirm whether a Gemini skill reaches the 100-character suggestion list.
- Check Cursor and Copilot CLI by hand with a long description.
