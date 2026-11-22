---
spec-type: behavioral
---

# dependencies/skill — a user asks `/dependency doctor` and learns what a plugin needs, without anything changing

Part of [dependencies](../README.md). Its What, non-goals, key terms, and actors apply here; IDs are shared across the
parent and this child. The skill's eval cases hold the functional detail.

## Use Cases

### UC4 — Examine a plugin's dependencies through the skill (A1.1)

- **Trigger:** a user asks whether a plugin has what it needs, or why it fails to load, in words or as
  `/dependency doctor`.
- **Entry points:** Skill: the `dependency` router skill's `doctor` command. It runs the CLI of UC1.
- **Inputs:** the plugin root the user names, else the current folder; the harness the user names, else the one
  detected.
- **Outcome:** the user reads each dependency's state, each problem with its code, and the command's steps in order.
- **Extensions:**
  - UC4.1 The plugin declares none: the user is told so.
  - UC4.2 No single harness is detected and the user named none: the user is asked which harness to examine, and
    nothing is examined before the answer.
  - UC4.3 The user asks the skill to fix what is missing: the user gets the steps to run, and nothing is run.

## Criteria

- R24 (UC4): The report carries every dependency's state and every problem's code as the command gave them.
- R25 (UC4, UC4.3, N1): The skill runs none of the steps, and gives no install command the command did not print.
- R26 (UC4, R22): No plugin, settings, or install-record file changes.
- R27 (UC4): A harness the user names is the one examined.
- R28 (UC4.2): With no harness detected or named, the skill asks for one instead of guessing.

## References

- The command it runs and its exit values: the parent's UC1, R20, and R21.
- Router skills and the `doctor` verb: the [glossary](../../glossary.md#verbs).
