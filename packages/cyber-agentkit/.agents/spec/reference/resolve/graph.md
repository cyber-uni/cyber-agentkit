# reference/resolve — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## Resolving a name

A name resolves to one of these outcomes, each on its own:

- `invalid`: it is not a name; nothing is read.
- `found`: the contributions compose into the resolved reference, with every project section inlined.
- `found` with a warning: a fault was met and the documented default used; the answer still comes.
- `missing`: no contribution answers, or a `remove` turned the name off.
- `ambiguous`: the contributions cannot be put in one order; the options are listed.

| Edge | Decision | Outcome |
| --- | --- | --- |
| E1 | a valid name? | otherwise `invalid`: nothing is read for it, and the other names still resolve |
| E2 | a qualified `<plugin>/<name>`? | that plugin's version and the stack it builds on; the tiers above still apply |

## Reading layers

| Edge | Decision | Outcome |
| --- | --- | --- |
| E15 | the plugin tier | enabled plugins of the detected harness, plus the plugin dependencies the root declares |
| E69 | a plugin a `package.json` below the root declares, outside the plugin tier | a project section for that package's folder, never a plugin layer |
| E22 | a `governances/` folder | never read |
| E17 | a layer skipped for a reason | in the trace with its reason; adds no contribution |

## Finding names

| Edge | Decision | Outcome |
| --- | --- | --- |
| E18 | `list` | one row per name; a trace gives one per layer and per skill default |
| E19 | `search` | each name resolved as `load` would, and each project section searched; best match first |
| E20 | no match | axi's empty answer, an explicit zero |
| E48 | skill defaults | found in the skill folders the detected harness reads; on an unverified harness none, and the answer says so |

## Renames

| Edge | Decision | Outcome |
| --- | --- | --- |
| E65 | a name listed in another name's `aliases`, and held by no contribution as its own | resolves the new name, with a warning; listed by two names, `ambiguous` |
| E76 | a name an interface document lists in `aliases` | `<old id>.interface`, and `<old id>` of a `many` interface, resolve the interface document, with a warning |

## Legacy forms

| Edge | Decision | Outcome |
| --- | --- | --- |
| E72 | a contribution in a legacy form | read as 2.0 reads it, with `reference-legacy-format` naming the 2.0 form and `reference migrate` |
| E73 | a load of a name a plugin's rename table lists as older | answered as that name, with `reference-renamed` naming the new name |
