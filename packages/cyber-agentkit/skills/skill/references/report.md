# Report a skill's eval results

Publish a skill's accepted eval results, the `evals/expected.json` that `test` saves when its author accepts a run,
where readers see them: its docs page, its README, or a site generator. Run no test, and change no file but the one
the author names.

## 1. Find it

Find the skill as [check](check.md) does.

## 2. Print the report

Run the command; it reads the results, so never write the tables by hand:

```sh
node <this skill's folder>/scripts/cyber-agentkit.mjs skill report <skill folder>
```

It prints the Evals section as Markdown, starting at its `## Evals` heading: the summary line and cost, the gap over
the no-skill baseline, the trigger cases, each criterion with the skill and without, the outcome cases, runs the
sandbox broke, and the trend over the kept accepted results. A guard case (`guard: true` in `evals.yaml`) that passes
without the skill too reads as expected, and the gap leaves out the criteria only guards test. Add `--format json` when a site generator will read it,
and `--test-link <url>` when the page should link `skill test` somewhere other than the cyber-agentkit docs site.

A criterion or case the author attested as passing in real use (see [attest](attest.md)) shows as `attested` with its
link, beside the criterion and in an `### Attested` section, never as a pass rate, and a stale one says `stale: skill
changed since`.

A case or criterion marked known to fail (see [fails](fails.md)) shows as `known failure (<reason>)`, never as a pass
rate, and in a `### Known failures` section.

When it prints `This skill has no saved eval result yet`, say so plainly, and point to `test`; write nothing.

## 3. Put it where the author asked

Put the output into the file the author named, as printed, replacing an earlier Evals section from the command if the
file has one. With no file named, show it in the reply. Say that a rerun after the next accepted result refreshes it.
