---
"cyber-agentkit": minor
---

`skill test --estimate` reads the test budget from `skill-design.autonomy` itself, unless `--budget-cost` or
`--budget-runs` gives one, and prints a `line` field, such as `Test budget: over (24 runs, $4.32; budget $0.01 or 1
runs)`, that says when no budget is configured. `/skill` reports that line as printed. A `skill test` run is now held
to its $0.50 cost cap by the provider, from the run's transcript, instead of through the Agent SDK, which showed the
budget to the model. A new warning check, TRG-10, asks that a description open with a first sentence of at most 100
characters that says what the skill does, since a slash-command menu shows only its start.
