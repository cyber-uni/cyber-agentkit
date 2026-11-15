---
"cyber-agentkit": minor
---

`skill report <folder>` prints a skill's accepted eval results for its docs, as Markdown ready to paste into a docs
page or README, or as JSON with `--format json`: the summary and cost, the gap over the no-skill baseline, the trigger
cases, each criterion with the skill and without, the outcome cases, runs the sandbox broke, and the trend over the
kept accepted results. It says so plainly when the skill has no accepted result.
