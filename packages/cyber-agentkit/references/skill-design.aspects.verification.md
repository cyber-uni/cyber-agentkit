---
description: The default Verification aspect of /skill - eval cases in evals/evals.yaml, run on promptfoo in a sandbox, several runs per case against a run without the skill.
tags: [skill-design, aspect, verification, evals, promptfoo]
implements: skill-design.aspects.verification@1
check-script: ../skills/skill/scripts/check-verification.mjs
---

## Draft

1. **Trigger cases.** Write at least three requests that should fire the skill, phrased the way different users
   would ask, and at least three near misses: requests a user could plausibly make that belong to another job, taken
   from the near misses Trigger listed. Keep each to what a user would type.
2. **Outcome cases.** Write at least one case per criterion: a request and the files it works on. Put the files under
   `evals/files/<case id>/`. Use small, made-up inputs; never copy private data into a case.
   A run has no user to answer a question, so a case whose skill asks before it writes states the approval in its
   prompt, such as "I approve writing it; don't ask again".
3. **Rubrics.** For each Criteria ID, write the checks that decide it from a run's output. Prefer a deterministic
   check. Use `judge` only when no deterministic check decides the criterion, and say so to the author.
4. Mark a case `effects: outside` when running it would reach past the sandbox, such as posting to GitHub. It is not
   run.
5. Show the cases and rubrics to the author before writing them.

## Cases

The skill's `evals/evals.yaml`:

```yaml
runs: 3            # runs per case; optional
threshold: 2       # runs a criterion must pass out of `runs`; optional
timeout: 300       # seconds one run may take; optional, 300 by default
concurrency: 4     # runs at once; optional; below half the hardware threads by default, never above it
trigger:
  - prompt: write release notes for the last release
    expect: fire
  - prompt: summarize this pull request for a reviewer
    expect: skip
outcome:
  - id: two-prs
    prompt: write release notes for the changes in this folder
    files: files/two-prs      # copied into the run's folder; optional
    criteria: [C1, C2]        # optional; every criterion by default
    effects: outside          # optional; the case is not run
    checks:                   # optional; per-case checks that replace rubrics.<ID> for this case
      C2:
        - contains: "no merge commits"
rubrics:
  C1:
    - contains: "## Release notes"
  C2:
    - not-regex: "Merge (pull request|branch)"
  C3:
    - judge: Pass when every pull request title in the input appears exactly once.
```

A rubric is a list of checks; a run passes the criterion when every check passes. The checks are `contains`,
`not-contains`, `regex`, `not-regex`, `file-exists` and `file-contains` (`{path, text}`) on the run's folder,
`script` (a command run in the run's folder that exits 0 to pass), and `judge` (a statement a named judge decides).

A rubric judges every outcome case that tests its criterion by the same checks. When a case needs different checks, give
it `checks`, a mapping of criterion ID to a list of checks of the same kinds. For that case, a criterion listed in
`checks` uses those checks instead of `rubrics.<ID>`:

```yaml
outcome:
  - id: find-none
    prompt: Is there a reference about deploy checklists?
    files: files/repo
    criteria: [C6]
    checks:
      C6:
        - regex: "\\b([Nn]o|[Nn]othing|[Nn]one)\\b.{0,40}\\b(match|reference|found)"
```

A criterion counts as having a rubric (VER-3) when it has `rubrics.<ID>` or when every outcome case that tests it has
`checks.<ID>`. An ID in `checks` that is not a Criteria ID fails VER-3.

## Run

Run `test <skill folder>` with the `/skill` command, as its Run the command says. It runs promptfoo at a pinned version
through `npx`, so the first run downloads it. Add `--judge <model>` only when the author named a judge, `--baseline
<folder>` to compare with another version instead of a run without the skill, and `--model <model>` to choose the model
each run uses. It saves the result, prints it, and exits 1 when a case or a criterion fails. Each run's result stays local (the
results folder ignores itself). Each save keeps `latest.json` and the 5 most recent past results of the skill, and deletes
older ones. The reply of every run, passed or failed, goes in a file beside the result that its `replies` field names. It also deletes the results of any other skill whose recorded skill folder no longer exists, and leaves a
result with no recorded folder alone. Add `--accept` to also keep the result as the skill's expected result,
`evals/expected.json`, which `changed` compares with in later runs; `skill accept <folder>` does the same with the last
saved result without running. `expected.json` is optional, and the checks do not require it. Each run makes model calls:
say so before the first run in a session.

- The default is `runs: 3` and `threshold: 2`. A criterion passes when it passes in at least `threshold` runs.
- Each run starts in a fresh copy of the case's files, which is a git repository with those files committed (a local
  throwaway identity; the installed skill is excluded from `git status`), so a skill or a `script` check can use git. It has no user configuration, memory, or user-level skills, and
  only the skill under test installed, through promptfoo's Claude Agent SDK provider and Claude Code's own login. Web
  tools are off, and each run stops at 20 turns or $0.50.
- A skill developed in a plugin (a folder above it holds `.claude-plugin/plugin.json`, and the skill is in that
  plugin's skills folder) runs inside a copy of that plugin from the working copy, loaded through the provider's
  `plugins` option, so it reads the plugin's references and other skills as an install would. It is then called
  `<plugin>:<skill>`. The baseline loads the same copy without the skill, or with the `--baseline` version in its place.
  The copy leaves out `node_modules` and `.git`. Each run gets a copy of its own, committed in a git repository, and a
  `script` check finds it at `$SKILL_TEST_PLUGIN`: `git -C "$SKILL_TEST_PLUGIN" status --porcelain` tells whether the
  run changed the installed plugin, and `node "$SKILL_TEST_PLUGIN/skills/<skill>/scripts/<script>"` runs its scripts.
- Each run records every skill it calls in `.skill-test/skill-calls.jsonl`, one JSON line `{"skill", "args"}` per call,
  excluded from `git status`. A `script` check reads it to decide what a skill handed to another, such as the
  description a skill passed to `/skill create`.
- Each run's `HOME`, `XDG_CONFIG_HOME`, and `CLAUDE_CONFIG_DIR` point at fresh empty folders, so a skill's own CLI run
  through Bash finds no user references or plugins, no installed Claude Code plugin is loaded, and the Bash tool sources
  no user shell snapshot. Claude Code's login still works because `CLAUDE_SECURESTORAGE_CONFIG_DIR` points at the real
  Claude config folder (or the one already set), where Claude Code reads and refreshes its own credentials; no credential
  is copied or linked, and `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` pass through when set. If a Claude Code
  version ignores that variable, each run fails with "Not logged in" and counts as not run. On macOS the real config
  folder is kept instead, since the keychain entry is named after it, so plugins and the shell snapshot still leak
  there. A skill that reads a file by its absolute path under the real home still reaches it. The folder of the `node`
  running the test goes first on `PATH`, since a version manager's shim reads its config from the home folder; another
  tool a shim provides may not run.
- Each case runs twice over: once with the skill and once without it, which is the baseline.
- At most `concurrency` runs go at once: by default the largest number below half the machine's hardware threads (7 of
  16), and at least 1. A larger `concurrency` is lowered to that.
- `skill test <folder> --case <id>` (repeatable) runs only the named cases, outcome IDs or `trigger-<n>`. The result is
  marked partial, is compared with the expected result for those cases only, and is never saved as the expected result.
- A run stops after `timeout` seconds (300 by default, set in `evals.yaml`); its Claude process and the shells and commands it started are killed, and it counts as not run with the reason `time limit`. A process stuck in uninterruptible disk sleep cannot be killed; the test stops waiting for it and goes on.
- A run that errors or hits its time or token limit counts as not run, never as a pass.
- In a run, one shell command stops after 30 seconds unless the model asks for longer, and after 2 minutes at most;
  it is stopped, not moved to the background, so a runaway command such as `find /` costs seconds, not the whole run.
  A skill under test cannot start a background command.
- A trigger case runs only with the skill. It passes when the skill fired (`expect: fire`) or did not (`expect: skip`) in at least `threshold`
  runs. A trigger run is cut short: it ends at the first skill the model calls, counting as fired only when that is the skill under test, or after three turns, so it does not go on to do the whole job. Running out of those turns is not an error.

### Other harnesses and backends

Runs drive Claude Code by default. Where a run keeps its config, skills, plugins, and login comes from the harness's
own definition (`headlessInvocation(<harness>).isolation` in the library), not from code written for one harness.

- `--harness codex` runs each case through `codex exec --json`, writing only inside the run's folder
  (`--sandbox workspace-write`) and keeping no transcript. The skill goes under `.agents/skills/<skill>/`. Codex keeps
  its login inside its config folder (`CODEX_HOME`), so that folder stays the real one, and `--ignore-user-config
  --ignore-rules` keep its `config.toml`, plugins, and rules out. The global `$CODEX_HOME/AGENTS.md` still loads; the
  test warns about it. A skill counts as used when a command reads its `SKILL.md`; a trigger run ends there. Codex has
  no flag to load a plugin folder, so a skill developed in a plugin gets that plugin's skills as project skills,
  without its references. Those skills are copies, so a check on `$SKILL_TEST_PLUGIN` does not see a change the run
  made to them. Name the model with `--model`, as Codex's own default may not be on the account. Codex
  reports no cost.
- `--backend plugin-eval` runs the cases on Claude Code's own `claude plugin eval` instead of promptfoo. The cases
  become an eval suite (`skill-test-evals/<case>/case.yaml`) in a copy of the skill's plugin, or in a plugin made for
  the skill, and its JSON result is read into the same result. Each run starts in a git repository holding the case's
  files, made by a scaffold script. `claude plugin eval` has no custom-code graders, so a criterion with a `script`
  check is reported as not tested; the other checks become `regex` graders, and `judge` an `llm` grader. Trigger
  cases run with the plugin only, and stop at three turns. The baseline is the run's own no-plugin arm, or, for a
  skill in a plugin or with `--baseline`, a second run on a copy of the plugin without the skill or with that
  version. It drives Claude Code only.

## Criteria

- **VER-1** [script] `evals/evals.yaml` exists and follows the format in Cases.
- **VER-2** [script] It has at least three `fire` and three `skip` trigger cases.
- **VER-3** [script] Every Criteria ID has a rubric, and every rubric names a Criteria ID.
- **VER-4** [script] Every `files` folder an outcome case names exists.
- **VER-5** [script] `threshold` is between 1 and `runs`.
- **VER-6** [read] Each `skip` case is a request a user could plausibly make that belongs to another job, not an
  unrelated one.
- **VER-7** [read] Each rubric decides its criterion, not something easier that happens to go with it.
- **VER-8** [read] No case holds private data, such as real names, tokens, or customer text.

## Fix

- VER-1 to VER-5: write or correct the file as Draft and Cases say.
- VER-6: replace the case with a near miss Trigger listed, or ask the author for one.
- VER-7: rewrite the rubric, and use `judge` only when no deterministic check decides the criterion.
- VER-8: replace the data with made-up data of the same shape.

## Enhance

- A trigger miss or a wrong result seen while the skill was used: add it as a case.
- A case that passes with and without the skill alike: it does not show what the skill adds.
- A `judge` rubric that a deterministic check could replace.
