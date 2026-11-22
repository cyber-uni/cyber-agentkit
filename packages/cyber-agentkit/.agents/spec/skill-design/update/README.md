---
spec-type: behavioral
status: draft
---

# skill-design/update — an existing skill is changed for a named reason, and only what the change touched is re-run

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children.

## Use cases

### UC29 — Update a skill for a reason the work names (A1.9)

- **Trigger:** other work edits an existing skill: a request, an issue, or a bug, including work that never says
  "skill" but changes a skill's files or a reference it loads.
- **Entry points:** skill (primary): `/skill update [skill] [change]`.
- **Inputs:** the skill; the change the work names; its eval cases, grouped in scopes (K11); the autonomy level and
  the test budget.
- **Success:** the change is made and nothing else. A behavior it adds or alters has a case for it in the scope of the
  part it changes. `check` passes, and `test` runs only the cases the change made stale (K12). The report says which
  scopes ran and why, and which stayed current.
- **Extensions:**
  - **UC29.1** The change asks for a different job from the skill's Intent. Nothing changes, and the run stops with
    the options of changing the Intent or creating a new skill.
  - **UC29.2** The change lands in a shared section of `SKILL.md` but concerns only some parts. `update` proposes
    moving that text into those parts' instructions files, so a later change to it selects only them.
  - **UC29.3** The stale cases are over the test budget. The run stops as E2 says, and the change is kept.
  - **UC29.4** The skill came from an installed plugin. Before the first edit, the author is told that a plugin
    update will overwrite it.

## Criteria

**Update (UC29)**

- R188 (UC29): `update` changes only what the work names, and adds a case for each behavior it adds or alters, with
  an ID, in the scope of the part it changes.
- R189 (UC29): After the change, `update` runs `check`, then `test` on the stale cases only, and its report names
  each scope that ran with the input that changed, and the scopes that stayed current.
- R190 (UC29.2; E1): When an edit to a shared section concerns only some parts, `update` proposes moving that text
  into their instructions files, and applies the move only as the autonomy level allows.
- R191 (UC29.1; E3): When the change asks for a different job from the skill's Intent, `update` changes nothing and
  stops with the Stop outcome R167 states.

UC29.3 is R166 with R177's selection, and UC29.4 is R43's rule; neither is restated here.

## Open questions

None.

## References

- Scopes and stale cases: [test](../test/README.md) (R177 to R183) and decision record
  [0007](../../design/decisions/0007-eval-scopes.md).
