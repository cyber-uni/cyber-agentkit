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
        - regex: "(?i)(no|nothing|none)\\b.{0,40}\\b(match|reference|found)"
```

A criterion counts as having a rubric (VER-3) when it has `rubrics.<ID>` or when every outcome case that tests it has
`checks.<ID>`. An ID in `checks` that is not a Criteria ID fails VER-3.

## Run

Run `test <skill folder>` with the `/skill` command, as its Run the command says. It runs promptfoo at a pinned version
through `npx`, so the first run downloads it. Add `--judge <model>` only when the author named a judge, `--baseline
<folder>` to compare with another version instead of a run without the skill, and `--model <model>` to choose the model
each run uses. It saves the result, prints it, and exits 1 when a case or a criterion fails. Each run makes model calls:
say so before the first run in a session.

- The default is `runs: 3` and `threshold: 2`. A criterion passes when it passes in at least `threshold` runs.
- Each run starts in a fresh copy of the case's files, with no user configuration, memory, or user-level skills, and
  only the skill under test installed, through promptfoo's Claude Agent SDK provider and Claude Code's own login. Web
  tools are off, and each run stops at 20 turns or $0.50.
- Each case runs twice over: once with the skill and once without it, which is the baseline.
- A run that errors or hits its time or token limit counts as not run, never as a pass.
- A trigger case runs only with the skill. It passes when the skill fired (`expect: fire`) or did not (`expect: skip`) in at least `threshold`
  runs.

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
