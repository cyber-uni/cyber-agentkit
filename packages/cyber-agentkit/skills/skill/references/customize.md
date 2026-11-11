# Customize the aspects and autonomy

Show what `/skill` uses, take the author's picks in one answer, and write them through the `reference` skill of
`cyber-agentkit`. Write no reference file yourself.

## 1. Show what is in use

1. With the `reference` skill's Find mode, run `implementations skill-design.aspects.*`. For each aspect, show the
   implementation in use (`inUse`) and the ones available, each with its pin and description.
2. Load `skill-design.autonomy` and show each command's level (`ask`, `apply-safe`, or `apply`).
3. With an `[aspect]` given, show only that aspect, and say the others are unchanged.

## 2. Ask once

Ask in one question what to change: an implementation per aspect, one plugin for every aspect, autonomy levels, and
whether it applies to the whole repository (`repo`, the default) or to the author alone (`user`). Change nothing the
author does not name.

## 3. Write through `reference`

With the `reference` skill's Customize mode:

- One plugin for every aspect: one `customize skill-design.aspects.*` with that plugin as the step.
- A pick per aspect: one `customize skill-design.aspects.<aspect>` per aspect named.
- Autonomy: customize `skill-design.autonomy` with the levels asked, by request; it is not part of the aspect family.

## Report

Each aspect and level: what it uses now, and for each one not changed, why (the plugin does not implement it, or the
author did not name it). Say that the next `/skill` command uses the new picks.
