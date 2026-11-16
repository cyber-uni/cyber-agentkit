---
description: The default Verification aspect of /skill - eval cases in evals/evals.yaml, run on promptfoo in a sandbox, several runs per case against a run without the skill.
tags: [skill-design, aspect, verification, evals, promptfoo]
implements: skill-design.aspects.verification@1
check-script: ../skills/skill/scripts/check-verification.mjs
---

## Draft

Three things are easy to confuse. An **eval** is a model run of the skill on a case. A **check** grades that run:
a deterministic one (`script`, `regex`, `contains`, `file-exists`, and the like) or a `judge`. An **ordinary test** is
a test in the project's own suite. A deterministic check is not an alternative to an eval: it grades the same run, and
it removes the grader's variation, not the run's. The run is nondeterministic whichever check grades it, which is why
a case runs several times.

A behavior leaves the eval for an ordinary test when a program does the same thing every time: a bundled script,
parsing, validation. Give that script a native test in the project's suite. The eval checks only what the skill's
instructions make the model do: whether it triggers, what it does, and what it reports.

1. **Trigger cases.** Write at least three requests that should fire the skill, phrased the way different users
   would ask, and at least three near misses: requests a user could plausibly make that belong to another job, taken
   from the near misses Trigger listed. Keep each to what a user would type. A name-only skill (see `/skill`'s Trigger)
   is never matched to a request, so write only the near misses for it, as `skip` cases.
2. **Outcome cases.** Write at least one case per criterion, and list each criterion in the `criteria` of at least one
   case: a request and the files it works on. Put the files under
   `evals/files/<case id>/`. Use small, made-up inputs; never copy private data into a case. Add and remove a case with
   `skill case add <skill folder> <case id> --prompt <request>` and `skill case remove <skill folder> <case id>`,
   never by deleting or rewriting case folders in the shell.
   `skill case add` also takes `--criteria C1,C2` and `--check <ID>=<script>`, and adds the entry after the last case
   without reformatting the others.
   When a case needs a state plain files cannot hold, such as a git history with a start commit and uncommitted work,
   give it a setup script (`skill case add ... --setup` scaffolds `evals/setup/<case id>.sh`) that makes that state.
   A case whose state is most of another's starts from a copy of that case's script with `--from <case id>`.
   The prompt then holds only the request: never tell the model to run a setup step.
   The setup runs with an empty `HOME`, and the run's `.git/hooks` and `.git/config` are read-only: a write there fails
   with `Read-only file system` or `Device or resource busy`. Install a git hook from a tracked folder instead, with
   `git config --global core.hooksPath "$PWD/hooks"`, which writes the run's own `HOME`, and set any other git config
   with `--global` too. `skill case try <skill folder> <case id>` runs the setup alone, as a run runs it, with no model
   call: it prints the folder's `git status --porcelain` and keeps the folder and home under the skill's results
   path (`try/<case id>/`). A path the setup wrote into the home, such as `core.hooksPath`, names the run's own folder,
   not the kept copy.
   A run has no user to answer a question, so a case whose skill asks before it writes states the approval in its
   prompt, such as "I approve writing it; don't ask again".
3. **Rubrics.** For each Criteria ID, write the checks that decide it from a run's output. Call them all checks; the
   `evals.yaml` key stays `rubrics`. Prefer a deterministic check: when the criterion names something in the files, the
   git state, or a reply line the prompt can require, a `script` or `regex` decides it. Use `judge` only when no
   deterministic check decides the criterion, and say so to the author.
   A criterion whose checks are all `judge` is not tested unless the run names a judge, so a reply that lists parts or
   asks a question is a `regex` or `contains` check that accepts the ways of saying it, not a `judge`. When a `judge`
   cannot be avoided, name the criterion to the author and ask which model should judge (a tier or a model ID); the
   test then runs with `--judge <model>`. Never leave the choice unasked, and never write a judge model into a case.
   A check tests what the outcome left behind: a file changed or left unchanged (a `script` on `git status`), a
   report or section present, the options a stop listed, or a skill called (`.skill-test/skill-calls.jsonl`). It
   never tests one exact phrasing or a punctuation mark. Where a check must read the reply's wording, it accepts the
   ways of saying the same thing: "not counted", "uncounted", and "neither is counted"; a label in any case or
   markup, such as `Test budget: over` and ``**`test` budget:** over``; and a path written as `~/`, `$HOME`, or the
   run's absolute home folder. A `not-` check matches only what the criterion rules out, such as offering to run
   `fix`, and not advice against it, such as "don't run `fix`". Where a skill has several stops or branches, describe
   each outcome once, and have every criterion and check for that outcome test the same observable parts.
4. Mark a case `effects: outside` when running it would reach past the sandbox, such as posting to GitHub. It is not
   run. A case that needs the network, such as one that installs a package, lists the hosts it may reach in
   `network`; every other host stays closed.
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
    setup: setup/two-prs.sh   # optional; run in the run's folder after the files are committed, before the model starts
    criteria: [C1, C2]        # optional; every criterion by default
    effects: outside          # optional; the case is not run
    network: [registry.npmjs.org]  # optional; the hosts its runs may reach (`*.example.com` for subdomains), none by default
    guard: true               # optional; a regression guard, expected to pass without the skill too
    model: top                # optional; a tier (small, mid, top) or a model ID its runs use, over --model
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

A case's `setup` names a script, relative to `evals/`, that each run runs in its folder, in both arms and on both
backends, after the case's files are committed and before the model starts, so the model starts from the state it
makes. The script is not copied into the run's folder. When it exits non-zero, the run is reported as not run, with the
script's output, and counts toward no pass rate.

Mark a case `guard: true` when it keeps a behavior that also passes without the skill, such as one the plugin's CLI
teaches on its own. The report then shows a pass in both arms as expected, not as a skill that adds nothing, and leaves
the criteria only guard cases test out of the gap over the baseline. A guard that fails with the skill still fails. A
case meant to show what the skill adds is not a guard.

A rubric is a list of checks; a run passes the criterion when every check passes. The checks are `contains`,
`not-contains`, `regex`, `not-regex`, `file-exists` and `file-contains` (`{path, text}`) on the run's folder,
`script` (a command run in the run's folder that exits 0 to pass, contained as a setup script is), and `judge` (a statement a named judge decides).

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
each run uses: a tier (`small`, `mid`, `top`) or a model ID. Without `--model`, each run uses the harness's mid-tier
model (`sonnet` on Claude Code), not its most capable one; a harness whose tiers are not known, such as Codex, runs on
its own default, and the test warns. A case's own `model`, a tier or an ID, wins over `--model` for that case: set it
on a case known to need a stronger model, or one a cheaper model does well. A tier the harness does not map is an
error before any run. `--judge` alone sets the judge's model. A skill tested only on a mid-tier model may behave
differently on the model its users run. It saves the result, prints it, and exits 1 when a case or a criterion fails. Each run's result stays local (the
results folder ignores itself). Each save keeps `latest.json` and the 5 most recent past results of the skill, and deletes
older ones. The reply of every run, passed or failed, goes in a file beside the result that its `replies` field names. It also deletes the results of any other skill whose recorded skill folder no longer exists, and leaves a
result with no recorded folder alone. Add `--accept` to also keep the result as the skill's expected result,
`evals/expected.json`, which `changed` compares with in later runs; `skill accept <folder>` does the same with the last
saved result without running. Each accept moves the expected result it replaces to `evals/accepted/`, keeping the 3
newest, and the report's `moved` names the cases whose pass rate changed across them and this run. `expected.json` is
optional, and the checks do not require it. Each run makes model calls:
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
- When that plugin declares `dependencies` in its `plugin.json`, both arms load each plugin it depends on, and each one
  those depend on, since Claude Code does not start a plugin without them. Each comes from a folder passed with
  `--plugin <folder>` (repeatable, matched by the folder's manifest `name`), else from Claude Code's installed plugins,
  a user-scope install first. A run reads a dependency's copy but cannot write it. When one is found in neither, `test`
  stops with `error: dependency-missing:` and names it. Before the first run, `test` also asks Claude Code whether each
  plugin a run loads does load (`claude plugin list`, which spends nothing), and stops with `error: plugin-load:` and
  Claude Code's reason when one does not, so no case is scored on a run that loaded no skill. When that check cannot
  run, such as with no `claude` on `PATH`, the test warns and goes on.
- Each run records every skill it calls in `.skill-test/skill-calls.jsonl`, one JSON line `{"skill", "args"}` per call,
  excluded from `git status`. A `script` check reads it to decide what a skill handed to another, such as the
  description a skill passed to `/skill create`.
- Each run's `HOME`, `XDG_CONFIG_HOME`, and `CLAUDE_CONFIG_DIR` point at fresh empty folders, on every platform, so
  a skill's own CLI run through Bash finds no user references or plugins, no installed Claude Code plugin or claude.ai
  connector is loaded, and the Bash tool sources no user shell snapshot. Claude Code's login still works because
  `CLAUDE_SECURESTORAGE_CONFIG_DIR` tells it where its credentials are: the real Claude config folder on Linux and
  Windows, and on macOS the keychain entry of the real config folder. No credential is copied or linked, and
  `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` pass through when set. Before the first run, `test` asks Claude
  Code whether a run is logged in, which spends nothing. When it is not, `test` stops with `error: login:` and says
  why: Claude Code is not logged in at all, or it is but no longer takes the login through that variable, with what
  to set instead. The folder of the `node` running the test goes first on `PATH`, since a version manager's shim
  reads its config from the home folder; another tool a shim provides may not run.
- Each Claude Code run is contained to its folder, as its harness definition declares (`containment`). The file tools read and write only the run's folder, its home, and its own
  plugin copy (`$SKILL_TEST_PLUGIN`). Shell commands run in Claude Code's sandbox (bubblewrap and socat on Linux and WSL, Seatbelt on
  macOS), which hides the home folders and the system temp folder; system folders that hold programs stay readable.
  The network is closed but for the hosts the case lists in `network`. When the sandbox cannot start, `test` stops
  with `error: sandbox:` rather than run a command outside it. The result's `blocked` lists what a run tried and was
  refused (`read`, `write`, or `network`, with the path or host), naming the case, arm, and run. A file tool's refusal
  and a host the sandbox denies are always listed; a shell read is listed when the command names the path, so a path
  a command builds as it runs is still refused but may go unlisted.
- A setup script and a `script` check are shell the case's author wrote, so each runs contained, on every harness, in
  Anthropic's sandbox runtime (`@anthropic-ai/sandbox-runtime`, pinned and run through the same `npx` install): it
  writes only to the run's own folders and reaches no network. When that sandbox cannot start (on Linux and WSL it
  needs bubblewrap, socat, and ripgrep), `test` stops with `error: sandbox:` and runs no script outside it.
- The sandbox settings are data: the YAML reference `skill-design.test.sandbox`, which names a template in `extends`
  and may change any of its settings key by key (`shell`, `scripts`, `fileTools`, `hook`). The plugin ships two
  templates. `skill-design.test.sandbox.claude-code`, the default, is the sandbox the two items above describe.
  `skill-design.test.sandbox.folder-only` runs shell commands, setup scripts, and `script` checks with no sandbox and
  with the network open, on both engines, for a machine that cannot run the sandbox. Each run still gets a fresh
  folder holding only the skill and its case files, an empty home and config folder, so no other skill or plugin
  loads, and file tools that reach only the run's folder. `--sandbox <template>` on `test` or `skill case try` loads
  `skill-design.test.sandbox.<template>` for one run, and `default` names `claude-code`; a tier may add a template of
  its own the same way. Only the managed, repo, and user tiers choose or change the settings, the file-tool limits
  included; another plugin's copy, a skill's own, and a project section are not read. An unknown key, a bad value, or
  an open network inside a sandbox stops the test before any run with `error: sandbox-invalid:`. A result whose
  shell commands had no sandbox lists in `wroteOutside` each path outside the run's folders that a shell command named
  and changed; a write to a path a command builds as it runs goes unlisted, and with no sandbox a shell command can
  write anywhere the user's account can. To make folder-only the default for a repository, write
  `.agents/references/skill-design.test.sandbox.meta.md` holding
  `extends: [cyber-agentkit/skill-design.test.sandbox.folder-only]` beside a `skill-design.test.sandbox.yaml` of only
  the settings to change, or the same files under `~/.agents/references/` for one user.
- When the skill's folder is outside the repository (`--root`, else the one holding the current directory), `test`
  lists each setup script and `script` check before the first run, with `warning: untrusted-scripts:`, and runs none of
  them unless `--trust-scripts` is given; the cases that need them are reported as not run. Read them before passing
  it. `vet` runs no script of a skill.
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
  reports no cost. Its definition declares no containment, so skill test does not contain a Codex run: only Codex's
  own `workspace-write` sandbox applies, a run may read outside its folder, `network` does not apply, and the
  result lists nothing as blocked. The test warns about it.
- `--backend plugin-eval` runs the cases on Claude Code's own `claude plugin eval` instead of promptfoo. The cases
  become an eval suite (`skill-test-evals/<case>/case.yaml`) in a copy of the skill's plugin, or in a plugin made for
  the skill, and its JSON result is read into the same result. Each run starts in a git repository holding the case's
  files, made by a scaffold script, which then runs the case's setup script in the same sandbox, installed for the run.
`claude plugin eval` has no custom-code graders, so a criterion with a `script`
  check is reported as not tested; the other checks become `regex` graders, and `judge` an `llm` grader. Trigger
  cases run with the plugin only, and stop at three turns. The baseline is the run's own no-plugin arm, or, for a
  skill in a plugin or with `--baseline`, a second run on a copy of the plugin without the skill or with that
  version. It drives Claude Code only. `claude plugin eval` runs each case itself, so skill test's containment does
  not reach it: a run may read outside its folder, `network` does not apply, and the result lists nothing as
  blocked. The test warns about it. `claude plugin eval` loads no plugin but the one it tests, so for a skill whose
  plugin declares `dependencies` the test stops with `error: dependency-unsupported:` before any run; test it on the
  default backend. It stops with `error: plugin-load:` when the plugin does not load, as the default backend does.

## Criteria

- **VER-1** [script] `evals/evals.yaml` exists and follows the format in Cases.
- **VER-2** [script, warning] It has at least three `skip` trigger cases, and at least three `fire` ones unless the skill is
  name-only.
- **VER-3** [script] Every Criteria ID has a rubric, and every rubric names a Criteria ID.
- **VER-4** [script] Every `files` folder and `setup` script an outcome case names exists.
- **VER-5** [script] `threshold` is between 1 and `runs`.
- **VER-6** [read, warning] Each `skip` case is a request a user could plausibly make that belongs to another job, not
  an unrelated one.
- **VER-7** [read, warning] Each rubric decides its criterion, not something easier that happens to go with it.
- **VER-8** [read] No case holds private data, such as real names, tokens, or customer text.
- **VER-9** [script, warning] No outcome case's prompt tells the model to run a setup script; that step is the case's
  `setup`.
- **VER-10** [read] Each check tests what the outcome left behind (files changed or unchanged, a report present,
  options listed, a skill called), not one exact phrasing or a punctuation mark; a check that reads the reply's
  wording accepts the ways of saying the same thing, and a `not-` check matches only what the criterion rules out.
- **VER-11** [script, warning] No `contains`, `not-contains`, `regex`, or `not-regex` check is a punctuation mark
  alone: once a regex's escapes such as `\b` and `\s` are dropped, its value holds a letter or a digit.
- **VER-12** [script, warning] No outcome case's setup script writes under `.git/hooks` or to the repository's git
  config (`git config` without `--global`, or a write to `.git/config`): both are read-only in a run.
- **VER-13** [script, warning] Every Criteria ID is listed in the `criteria` of at least one outcome case; a case with
  no `criteria` lists them all.
- **VER-14** [read, warning] No `judge` check decides a criterion that names something in the files, the git state, or
  a reply line the prompt can require; a `script` or `regex` would decide it.

## Fix

- VER-1 to VER-5: write or correct the file as Draft and Cases say.
- VER-6: replace the case with a near miss Trigger listed, or ask the author for one.
- VER-7: rewrite the rubric, and use `judge` only when no deterministic check decides the criterion.
- VER-8: replace the data with made-up data of the same shape.
- VER-9: move the step into a setup script (`skill case add ... --setup` scaffolds one for a new case), name it in the
  case's `setup`, and leave only the request in the prompt.
- VER-10 and VER-11: rewrite the check to test what the outcome left behind, as Draft's Rubrics say: a `script` on
  the files or the skill calls, or the parts of the reply that outcome always has, such as lettered options for a
  stop. Widen a wording check to the ways of saying the same thing, and narrow a `not-` check to what the criterion
  rules out. Keep what the criterion asks for.
- VER-12: install a hook from a tracked `hooks/` folder with `git config --global core.hooksPath "$PWD/hooks"`, and set
  any other git config with `--global`, as Cases says. Try the setup with `skill case try`.
- VER-13: list the criterion in the `criteria` of an outcome case that tests it, or add a case for it with
  `skill case add ... --criteria`.
- VER-14: replace the `judge` with a `script` or `regex` on the files, the git state, or the reply line.

## Enhance

- A trigger miss or a wrong result seen while the skill was used: add it as a case.
- A case that passes with and without the skill alike: it does not show what the skill adds.
- A `judge` rubric that a deterministic check could replace (VER-14).
- A behavior of a bundled script that an eval checks: move it to an ordinary test in the project's suite.
- A check that failed a run whose reply did the right thing: rewrite it as VER-10 says, and replay the saved replies
  (the result's `replies` file) to show the right replies now pass and a wrong one still fails.
