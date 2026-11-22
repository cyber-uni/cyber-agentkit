---
'cyber-agentkit': minor
---

Recognize capability references. A reference named `<system>.capabilities`, such as `asana.capabilities`, is a
capability reference: `reference check` reports its kind as `capability` and fails it, with the new `capability`
check, when its first three `##` sections are not System, Detect, and Verified in that order, or when it declares
`implements`. It never judges what a section says. `reference create <system>.capabilities` with no `--template`
stubs the three sections, each saying what it holds.

Add the `**Partial.**` support level beside `**Unsupported.**`. On an interface implementation, a required section
marked partial counts as present, and `check --trace` and `reference implementations` list each listed section marked
partial under `partial`, beside `unsupported`. The new `support-level` check fails a `**Partial.**` or
`**Unsupported.**` mark with no sentence after it, in any reference.

An interface whose id ends `.capabilities`, such as repobuddy's `project-tracker.capabilities`, now passes `check` with
a `reference-renamed` warning that names its rename to `<name>.blueprints`.

The `reference` skill's Create mode stubs a capability reference and suggests keeping it thin, and its Create,
Customize, and Load modes cover the partial mark.
