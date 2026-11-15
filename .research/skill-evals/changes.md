# Changes: skill-evals

## 2026-11-10

- Topic created. Surveyed ten candidate eval systems for the default behind the `/skill` `test` command. First version, no prior conclusion to change.
- 2026-11-10: recorded the decision (promptfoo first, `claude plugin eval` as the Claude backend when available),
  the sandboxing summary, and popularity figures (E19).
- 2026-11-10: recorded the spike (E20): promptfoo through pinned npx gives pass rates over repeats and a baseline arm; a wrapper provider is needed for fresh files per run. Updated the verdict and Next step.

## 2026-11-11

- Added E21: a local plugin loads through the SDK `plugins` option, and its skills are called `<plugin>:<skill>`.

## 2026-11-15

- Added E22: Anthropic's sandbox runtime (`srt`) contains a case's setup script and `script` checks with the same OS
  sandbox as Claude Code's Bash tool: writes only where allowed, no network.
- Added E23: the script sandbox puts `/dev/null` placeholders for the dotfiles it protects in the folder it starts
  in, which `git status` lists as untracked, so a script now starts it in an empty folder and changes into the run's.
