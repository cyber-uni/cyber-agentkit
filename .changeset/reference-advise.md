---
"cyber-agentkit": minor
---

`reference advise <paths...>` and `reference uses <paths...>` split what `reference audit` did, and work on any text an agent reads: a skill folder, an `AGENTS.md`, an agent definition, or a command file. `advise` reports what the text hard-codes that could move into references; it now reads every line, front matter included. `uses` lists the references the text loads, the files that load each, whether a bundled default ships beside it, and which tier answers it. `reference defaults` takes a folder and reports it as `folder`, and no `reference` command looks a skill up by name any more: `skill where <name>` finds a skill's folder. `reference audit` is deprecated: it takes paths, runs both commands, prints a notice naming them, and is removed in the next minor release. The library exports `adviseReferences`, `referenceUses`, `loadsIn`, `leadsIn`, and `findSkill`.
