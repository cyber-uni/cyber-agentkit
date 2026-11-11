---
spec-type: behavioral
status: draft
---

# skill-design/customize — a team chooses each aspect's implementation and how much each command applies on its own

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children. Retired IDs: R61.

## Use cases

### UC8 — Choose an implementation for one aspect (A3.1, A3.5)

- **Trigger:** a team wants a different rule for one step of designing a skill, such as its own trigger check, and
  keeps the rest.
- **Entry points:** skill (primary): `/skill customize [aspect]`, which hands the pick to the `reference` skill's
  Customize mode. Code: `reference customize skill-design.aspects.<aspect>`.
- **Inputs:** the aspect; the pick, as in [reference UC9](../../reference/write/README.md); the tier, `repo` for the whole
  repository or `user` for the customizer alone.
- **Success:** the next `/skill` command uses the pick for that aspect and leaves every other aspect as it was. Picking,
  extending, tiers, and what happens when a picked plugin is missing are as in reference UC9 and UC18.
- **Extensions:** none beyond reference UC9 and UC18; at run time a pick that cannot be found falls back to the
  default, as in UC1.3.

### UC9 — Choose for every aspect at once (A3.2, A3.4)

- **Trigger:** a team adopts `skill-design` and wants to choose an implementation for each aspect in one pass, or see
  which one each aspect uses.
- **Entry points:** skill (primary): `/skill customize`, which lists through the `reference` skill's Find mode and hands
  the picks to its Customize mode. Code: `reference customize` and
  `reference implementations` on `skill-design.aspects.*`.
- **Inputs:** the wildcard `skill-design.aspects.*`; for customize, a pick per aspect or one plugin for all of them;
  the tier.
- **Success:** one command writes a pick for each aspect the wildcard matches, and one command lists each aspect with
  the implementation it uses and the ones available. The wildcard is the `reference` spec's family ([reference UC24](../../reference/interfaces/README.md)),
  which owns its behavior; this spec states only the goal (N5).
- **Extensions:**
  - **UC9.1** One plugin is picked for all aspects and does not implement some of them. Those aspects keep their
    current pick, and the result names them.

### UC10 — Set how much each command applies on its own (A3.3)

- **Trigger:** a team or user wants commands to apply more, or less, without asking.
- **Entry points:** skill (primary): `/skill customize`, which hands the levels to the `reference` skill's Customize
  mode on `skill-design.autonomy`.
- **Inputs:** a level (K7) per command; the tier.
- **Success:** each command acts at its level. With no setting, `create` and `enhance` are `ask`, `fix` is
  `apply-safe`, and `check` and `test` change nothing at any level. To customize the `skill-design` references,
  the author picks them from one list instead of being asked about each in turn. The setting lives outside the `aspects` segment, so the aspect wildcard
  never matches it.
- **Extensions:**
  - **UC10.1** A level is set for `check` or `test`. It has no effect, and `/skill` says so.
  - **UC10.2** A level names no known value. That command uses its default, and `/skill` says so.

## Criteria

**Autonomy (UC10)**

- R90 (UC10): With no setting, `create` and `enhance` are `ask`, and `fix` is `apply-safe`. `skillify` has no level of
  its own: the `create` it runs acts at `create`'s level.
- R62 (UC10): At `apply-safe`, a command applies only the changes after which `check` and `test` pass with no
  criterion worse, and asks about the rest; with no author present, it reports the rest. At `apply`, it applies every
  change except those R74 keeps for the author, and reports each one.
- R74 (UC2, UC4.3, UC10): A decision only the author can make (R13, R41) is asked at every level, whatever else
  the level applies on its own. With no author present, it is reported as not applied.
- R63 (UC10.1): A level set for `check` or `test` has no effect, and `/skill` says so.
- R64 (UC10.2): A level that names no known value leaves that command at its default, and `/skill` says so.
- R65 (UC10): The level is read from the reference `skill-design.autonomy`, which the wildcard
  `skill-design.aspects.*` does not match.
- R66 (UC8, UC9, UC10): `/skill customize` lists the `skill-design` references, and the author picks which to
  customize in one answer instead of being asked about each in turn.
- R92 (UC8, UC9, UC10): `/skill customize` shows each swappable aspect with the implementation in use and the ones
  available, and each command's autonomy level, before it asks.
- R93 (UC8, UC9, UC10): `/skill customize` writes through the `reference` skill: every file it changes is one
  `reference customize` writes for the same picks, and it writes no reference file itself.

**Aspects and implementations (UC8, UC9)**

- R68 (UC8, UC11): After a pick for one aspect, the next command uses it for that aspect, and every other aspect behaves as
  before.
- R69 (UC9): One `customize` on `skill-design.aspects.*` writes a pick for every aspect it matches, and one
  `implementations` on it lists each aspect with the implementation it uses and the ones available.
- R70 (UC9.1): When one plugin is picked for every aspect and lacks some, those aspects keep their current pick, and
  the result names them.
