# Compare two wordings

Run the same outcome cases once with each wording loaded the way the harness loads `AGENTS.md`, and report which
wording meets each criterion more often. There are no trigger cases: an instruction is always loaded, so it never
fires.

## 1. Read the wordings

Name each wording as the author did: a file, or `<file>#<heading>` for one section, matched by its heading text or
its anchor. When the author names a wording only in words ("our Commit Discipline section", "the version in my
draft"), find the file and the heading yourself, and say which you took. A section runs from its heading to the next heading at its level or above, subsections included. Run
`compare <A> <B> --plan`. When it stops with `error: wording-missing`, `error: section-missing`, or
`error: section-ambiguous`, tell the author which wording it names, and stop.

## 2. Find the cases

Without `--cases`, the command looks for `.agents/instruction-design/cases/<name>.yaml` at the repository root, where
`<name>` is wording A's heading anchor (`commit-discipline`), else its file name; `--name` sets another. When `--plan`
stops with `error: no-cases`, draft the cases:

1. List the criteria: what must be true of a run's result when the instruction is followed. Write each as one
   statement that is true or false of the result, decidable from the result and the case's files alone.
2. Write at least one outcome case per criterion: a request a user would make in a repository the instruction
   governs, and the small, made-up files it works on, under `files/<case id>/` beside the cases file. A run has no
   user to answer, so a case states any approval in its prompt.
3. For each criterion, write the checks that decide it, as `skill test`'s Verification aspect gives them. Prefer a
   deterministic check; use `judge` only when none decides the criterion, and say so.
4. Draft the whole set from the wordings and the repository without asking anything along the way: read what each
   wording asks of the agent, and what the repository's files show it working on. Show the criteria, cases, and
   checks together, and ask once for approval. Write the file once they approve, or at once when the request already
   approves the cases, then run `--plan` again and go on to the run without stopping. With no author present, write
   nothing, run nothing, and report the drafted cases.

The cases file is a skill's `evals/evals.yaml` without `trigger`, plus `criteria`:

```yaml
runs: 3          # runs per case per wording; optional
threshold: 2     # runs a criterion must pass out of `runs`; optional
criteria:
  C1: The change is committed before the reply ends.
  C2: The commit message starts with a Conventional Commits type.
outcome:
  - id: typo-fix
    prompt: Fix the typo in notes.txt.
    files: files/typo-fix
    checks:
      C1:
        - script: test -z "$(git status --porcelain)"
rubrics:
  C2:
    - script: git log -1 --format=%s | grep -Eq '^(feat|fix|docs|chore|refactor|test)(\(.+\))?:'
```

When `--plan` stops with `error: cases-invalid`, tell the author what it says, and fix the file only with their
approval.

## 3. Run

`--plan` prints how many runs the comparison makes: every case, `runs` times, with each wording. Tell the author that
number, and about how long and how much the last comparison took when the line says so, before starting. Each run
makes model calls. Stating the number is not a question: go on unless the request asked only for the count. Then run `compare <A> <B>` with the same options, passing `--runs <n>` when the author named a run
count and `--judge <model>` only when they named a judge. Start it in the background where the harness can, and pass on
its progress lines on stderr at most once a minute, as `skill test` does. Never quote the model's replies in an update.

Each run starts in a fresh copy of the case's files committed in a git repository, with the wording written to the
harness's project instruction file (`CLAUDE.md` on Claude Code, `AGENTS.md` on Codex), after what the case's own file
already says. When the command stops with `error: login:` or `error: sandbox:`, pass the reason on as it is said; no run
was made.

## 4. Save the result

The command saves the result to `.agents/instruction-design/results/<name>/latest.json` at the repository root (or
under `~/` outside a repository), the way `skill test` saves its own: the previous `latest.json` moves beside it as
`<its at>.json`, the 5 most recent past results are kept, the reply of every run goes in the file `replies` names, and
the results folder holds a `.gitignore` containing `*`. The result records each wording as named with the SHA-256 of
the text its runs loaded, so a later reader can tell which text was measured.

For each criterion, an arm's pass rate is the runs that met it out of those that ran. The arm with the higher rate wins
the criterion; equal rates tie. The wording that wins more criteria wins the comparison; equal counts tie. A criterion
with no rubric, or whose rubric needs a judge none was named for, is not tested and counts for neither.

## Report

Each criterion with its statement, each wording's pass rate, and which won it; each failure with its wording, case, and
the output that broke it; the runs not run and why; what a run tried that its containment refused; and the winning
wording, or a tie, with the count of criteria each won. Name the file the replies are in. Leave the choice of wording,
and any edit to the instruction file, to the author.
