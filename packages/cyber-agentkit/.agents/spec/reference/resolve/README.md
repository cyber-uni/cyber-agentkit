---
spec-type: behavioral
---

# reference/resolve — a name is answered with the document its contributions compose, and anyone can see why

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC1 — Resolve names (A1.1)

- **Trigger:** a consumer's instructions name one or more references to load.
- **Entry points:** Skill: the `reference` skill's Load mode, which runs `load`. Code: `loadReference`.
- **Inputs:** one or more names; the root (K18); the calling skill's folder, for the `default` tier; the detected
  harness.
- **Outcome:** for each name, in the order asked, with status `found`, its resolved reference (K28): the main document
  (K23), composed as each contribution's `extends` and `merge` declare, followed by each project section below the root,
  in path order, each wrapped with the folder it applies to (R44). The managed contribution applies over the main
  document and over each project section (K27). Every project section in a folder git does not ignore is inlined (N17).
  No contribution's frontmatter or merge marker is part of it.
- **Extensions:** each name resolves on its own; a fault in one never stops the others.
  - UC1.1 No contribution answers: status `missing`, with the reason: no tier holds the name; the plugin a qualified
    name asks for is not installed; or a `merge: remove` contribution leaves nothing, so a consumer tells a name turned
    off from one that does not exist. The message and the trace name that contribution; they are not a contract (R39).
  - UC1.2 Its contributions cannot be put in one order: status `ambiguous`. The record carries the options. The message
    and the trace name the contributions in conflict and the cause; they are not a contract (R39).
  - UC1.5 A contribution has malformed frontmatter, an unknown `merge`, or a bad `extends`: it still answers, with a
    warning and the documented default (R105, R7, R106). A `merge: remove` contribution with a body: the body is
    ignored, with a warning, and the remove still applies.
  - UC1.6 Only `<name>.md` and `<name>/README.md` answer a name. Both in one folder: the first answers, and the other
    is ignored with a warning.
  - UC1.8 The document fails its interface check: still answered, with a warning.
  - UC1.10 A plugin's contribution answers over the default contribution, and no selection names it: still answered,
    with a warning naming the plugin and how to pick (UC9). The warning stops once a written `extends`, whether a
    selection (UC9) or a customization, names the plugin or the default. A plugin whose own `extends` names `default`
    has placed the default itself, so it gets no warning (R56).
  - UC1.21 A plugin holds the name, and the `repo` or `user` `extends` that builds the stack neither places it nor
    declines it (K35): still answered, with a warning naming the plugin and how to add it, or leave it out, with
    Customize mode (UC9). The warning stops once a customizer writes picks that place or decline it (R113).
  - UC1.13 A section matches no section below: with an explicit `<!-- merge: ... -->` marker, a warning, and its text
    goes at the end of its parent section (nothing, for `remove`); unmarked, it goes there with no warning (R6). A
    document repeating a heading: the first is matched, with a warning.
  - UC1.14 A generated document it uses is stale (K26): still answered, with a warning naming each changed or missing
    source and how to revise it (UC20).
  - UC1.16 No main document, but project sections exist: status `found`, with only the project sections. A generated
    section whose recorded sources are gone is stale (UC1.14).
  - UC1.17 A name whose main document is not Markdown gets no project sections: a Markdown project section found for it
    is not delivered, and neither is a non-Markdown file in a project folder, each with a warning (R99).
  - UC1.19 A project section holds `merge`, `extends`, `implements`, or `aliases` (K24): the key is ignored, with a
    warning naming it and the folder, and the section is still delivered.
  - UC1.22 A contribution is in a legacy form (K37): it is read as 2.0 reads that key or file, with a warning naming the
    file, the form, its 2.0 form, and `reference migrate` as the fix (R119). An installed plugin's file names its
    author's fix instead.

### UC2 — Explain a resolution (A2.1)

- **Trigger:** someone asks what an agent reads for a name and why, or where a customization of it would go.
- **Entry points:** Skill: the `reference` skill's Inspect mode. Code: `load` with a trace, and `where`;
  `resolveReference`, `whereReference`.
- **Inputs:** a name; the root (K18); the calling skill's folder, for the `default` tier; the detected harness;
  optionally a folder below the root.
- **Outcome:** the trace gives the name's status; the stack and what built it; for each section of the main document
  with managed applied over it, by heading path, the contributions that supplied its text and the operation each
  applied; every layer checked, highest first, with its outcome (K7) and the reason when it was not used; each project
  section with its folder; and, for a generated document, each recorded source and its versions. The resolved reference
  itself is unchanged. `where` gives the places a customization or a selection is written to in the `repo` and `user`
  tiers, each with who it reaches, and the heading paths of the main document that a section operation can target;
  given a folder, also the project section file for it.
- **Extensions:**
  - UC2.5 `where` on an ambiguous name: it lists each `<plugin>/<name>` and the default as options, and the places a
    selection goes to. It is not an error (R43).
  - UC2.6 `where` on a plugin's contribution or a default contribution: reported read-only, and never offered as a
    place to write.
  - UC2.7 Both `repo` and `user` hold a contribution: how they apply, and what is `shadowed`, is as R100 says.
  - UC2.10 `where` on a place a `replace` or `remove` above hides, a file there or not: it marks the place hidden and
    names the hiding contribution, so the customizer learns before writing that the file would not apply.

### UC3 — List and search (A3.1)

- **Trigger:** someone wants the names that exist, to load one or customize one.
- **Entry points:** Skill: the `reference` skill's Find mode. Code: `list`, `search`; `listReferences`,
  `searchReferences`.
- **Inputs:** a pattern or a query; the root (K18); the detected harness.
- **Outcome:** `list` gives one row per name with its description, and its status when not `found`; a pattern keeps
  exactly the names it matches. With a trace, it gives one row per name per layer holding it, and one per installed
  skill holding a default contribution of it, each with its outcome (K7); a selection's row is marked as one, a
  generated document's as generated, and a project section's row names its folder. `search` resolves each name as
  `load` would, and reads each project section, then gives matches best first, each with its name, description, and
  match kind; a match in a project section also carries its folder.
- **Extensions:**
  - UC3.1 Nothing matches: axi's empty answer, saying zero explicitly. It is not an error.
  - UC3.2 `search` with an empty query: a usage error.
  - UC3.3 A name whose plugins cannot be put in one order (R8): `list` marks it ambiguous with the options; `search`
    returns one match per plugin.
  - UC3.4 A name a `remove` turned off, with no project section left (R49): `list` shows it `missing`, and in the trace
    the `remove` row and each row below it as shadowed; `search` leaves the name out.
  - UC3.5 The detected harness's skill folders are not verified (`.research/skill-resolution` covers six harnesses; #114
    holds what stays open): `list` and `search` show no defaults, and say so. It is a limit of the harness, not a
    warning.

### UC7 — Build on other contributions (A5.1, A6.2)

- **Trigger:** an author (a plugin author, or a customizer in the `repo` or `user` tier) wants a contribution to
  build on other plugins' contributions, or on the loading skill's default, in a chosen order and way.
- **Entry points:** Skill: the `reference` skill's Create and Update modes. Code: the contribution's frontmatter
  `extends` and `merge`.
- **Inputs:** `extends`, steps bottom first, each a `<plugin>` or `default`, optionally with its own `merge` and
  `extends`; the contribution's own `merge`.
- **Outcome:** each step brings its own `extends` beneath it, recursively; a plugin both listed and brought in appears
  once, at its listed place. Each step applies with its own operation: the step's key, else the plugin's own `merge`,
  else `patch`. The contribution's body applies on top with its own `merge`. The highest written `extends` among the
  contributions used builds the stack: a managed contribution's, else the `repo` one's, else the `user` one's, else the
  own `extends` of the plugins and the default. The `user` and `repo` contributions apply over the stack in the order
  K23 gives, and the managed one over the result (K27). Anything left out of that `extends`, a plugin or `default`, is
  `not used`. So a house-style plugin changes what a generic skill reads without forking it.
- **Extensions:**
  - UC7.1 A step cannot be used, a lower `extends` differs, or a plugin lists itself: the step is skipped or the entry
    ignored, with a warning (R53, R54, R55).
  - UC7.2 The steps cannot be put in one order: as UC1.2 says. Repeats and a plugin brought in twice: as R54 says.
  - UC7.3 A malformed `extends`: as UC1.5 says; it counts as not written (R106).
  - UC7.4 A qualified name builds that plugin's own stack; a written `extends` is not used.
  - UC7.5 `extends` or `merge` on an interface document: ignored with a warning. An interface is never composed.
  - UC7.6 Both `repo` and `user` write `extends`: the `user` one is not used (R8, R100), so the user's own pick never
    reaches the repository's stack.

### UC10 — Confirm a managed contribution is in effect (A4.1)

- **Trigger:** an admin has placed `<name>.md` in a harness's managed folder, by hand or through device management,
  and wants to confirm it is in effect.
- **Entry points:** Skill: the `reference` skill's Inspect mode. Code: `load` with a trace.
- **Inputs:** a name; the root of a repository to check from; the detected harness.
- **Outcome:** the trace shows the managed contribution with its outcome, applied over the main document and each
  project section with its merge operation (K27), and what it changed in each section (UC2). Placing the file is outside
  this capability: it is written like any other contribution, in the managed folder that harness detection finds for
  each harness.
- **Extensions:**
  - UC10.1 The harness keeps its managed content where it cannot be read locally (an MDM domain, or a server): the
    trace shows that layer not read, with the reason.
  - UC10.2 The file sits in the managed folder of a harness other than the current one, or detection names no harness,
    or names more than one (nested harnesses; harness detection then reports `unknown`): that folder is not read, and
    the trace says so and names the detected harnesses, so the admin sees why.
  - UC10.3 A section of the managed contribution matches no section of the main document: as UC1.13 says. One that
    matches no section of a project section leaves that project section as it is.
  - UC10.4 A managed `replace` or `remove` drops every project section too.

### UC19 — Rename a name (A6.5)

- **Trigger:** a plugin author renames a name their plugin owns, for example to a neutral name other plugins can
  implement.
- **Entry points:** Code: frontmatter `aliases: [<older name>...]` on the owner's contribution of the new name: its
  plugin contribution, its default, or its interface document.
- **Inputs:** the new name; the older names it replaces.
- **Outcome:** a load of an older name resolves the new name, with a warning naming it, which Load passes on (UC4.7) so
  the skill's load line gets updated. A contribution filed under an older name in the managed, `repo`, `user`, or
  `project` tier applies as one of the new name, with a warning naming the file to rename. `list` and `search` show
  only the new name; the trace names the alias used.
- **Extensions:**
  - UC19.1 A contribution still holds the older name as its own (an old copy of a plugin, say): that name answers as
    itself, and the alias is not used, with a warning.
  - UC19.2 Two names list the same alias: a load of it is `ambiguous`, with both names as options.
  - UC19.3 One tier folder holds files under both the older and the new name: the new one applies, and the older one
    is ignored with a warning (R67, R97).
  - UC19.4 `aliases` in a `repo`, `user`, or managed contribution: ignored with a warning. In a project section:
    ignored with a warning (UC1.19). Only an owner renames.
  - UC19.5 An alias of an alias: not followed. The owner lists every older name.
  - UC19.6 A qualified older name `<plugin>/<older name>`: resolves as `<plugin>/<new name>`.
  - UC19.7 An alias that is not a valid name (R1): ignored with a warning.
  - UC19.8 An interface is renamed (its document lists the older id in `aliases`, R96): `implements: <old id>@<version>`
    in an implementation resolves to the renamed interface, and a load of `<old id>` or `<old id>.<key>` resolves `<id>`
    or `<id>.<key>`, each with a warning.
  - UC19.9 A plugin's rename table (K38) lists the name as an older one: a load of it answers as before, with a
    warning naming the new name and `reference migrate` (R120).
  - UC19.10 A plain document becomes the interface document of a `many` interface (the interface document lists the
    plain name in `aliases`, R128): a load of the plain name resolves the interface document, with a warning. A `repo`
    or `user` file under the plain name applies as the interface document, which is never composed, so it is reported.
    `check` and `implementations` take the plain name as they take the interface's own.

### UC21 — Scope a package's plugin to its folder (A8.2)

- **Trigger:** one package of a monorepo lists a plugin in its own `package.json` that the rest of the repository does
  not use, such as a billing package that tracks issues in Jira while the repository uses GitHub.
- **Entry points:** Skill: the `reference` skill's Load mode, which runs `load`. Code: `loadReference`.
- **Inputs:** a name; the root (K18); the `package.json` files below it; the detected harness.
- **Outcome:** the plugin is a package plugin (K36). Load delivers its contribution of the name as a project section for
  that package's folder (R44), ahead of the folder's own project section, with the managed contribution applied over it
  as over any project section (K27). The main document is the same from every working folder, so work in the package
  follows the plugin's version, and work elsewhere does not see it as theirs (R90).
- **Extensions:**
  - UC21.1 The plugin tier already holds the plugin (the harness enables it, or the root declares it): it is in the main
    document, and adds no project section.
  - UC21.2 A package and a package inside it both declare the plugin: only the outer package's folder gets its section,
    which already covers the inner one.
  - UC21.3 The `package.json` sits in a folder git ignores: it is not read.
  - UC21.4 Several plugins one package declares hold the name: each adds a section for that folder, a plugin after any
    plugin its own `extends` names.
  - UC21.5 The plugin's contribution carries `merge`, `extends`, `implements`, or `aliases`: they shape the plugin's own
    file, so they are left out of the section without a warning (contrast UC1.19).
  - UC21.6 A declared package is not a plugin, or ships no contribution of the name: it adds nothing.
  - UC21.7 A generated project section for that folder records the package plugin as a source, and goes stale when it
    changes (R101).
  - UC21.8 A `repo` or `user` `extends` builds the stack: the package plugin is not one of the plugins it places or
    declines (K35), so it raises no warning that it is not selected (R113).

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Composition**

- R3 (UC1): The stack applies bottom first in K17 order, each contribution over the result of everything below it with
  its own operation; the `user` and `repo` contributions then apply over it in the order K23 gives, and the managed one
  over the result (K27), each with its own operation. With no `merge` written anywhere, every contribution patches.
  Load delivers the project sections in path order, so an inner folder's section follows an outer one's; which wins
  where they conflict is the agent's ordering rule (R90).
- R100 (UC1, UC2): When both `repo` and `user` hold a contribution, both apply, the `repo` one over the `user` one; a
  `repo` `replace` or `remove` makes the `user` one `shadowed`. The `user` one's `extends` is not used (R8).
- R99 (UC1, UC10): Project sections follow the main document, each marked with its `folder` (R44), never composed into
  it. The managed contribution applies over each project section by heading path: a managed section that matches none
  of the project section's is not added to it, and a managed `replace` or `remove` drops every project section. With no
  main document but a project section, the name is `found` with only its project sections. A name whose main document
  is not Markdown gets no project sections, and warns for each one it skips.
- R110 (UC1): A project section carries no `merge`, `extends`, `implements`, or `aliases` (K24). Load ignores each such
  key with a warning, and still delivers the section.
- R6 (UC1): `patch` keeps what is below and puts each section's text in place of the text it matches by heading path,
  unless that text is empty. On a matched section, the subsections the contribution does not match are kept, and the
  ones it matches are replaced, recursively. A section that matches nothing is added at the end of its parent section
  (at the end of the document, for a top-level one).
- R5 (UC1): `combine` keeps what is below and adds each section's text after the text it matches, lower first, so the
  later text wins where they conflict. When combined text was joined, the resolved reference says so once, before the
  first section whose text was joined.
- R4 (UC1): `replace` drops everything below; each contribution below is `shadowed`.
- R49 (UC1): `remove` drops everything below, and its body is ignored with a warning. When no contribution above it (a
  managed one included) has a body, there is no main document: the name is `missing` and reported as turned off, unless
  a project section answers (R99). A managed `remove` drops the project sections too, so the name is `missing`.
- R42 (UC1): A merge marker under a heading applies that operation to that section alone; a section with no marker
  takes its document's operation.
- R50 (UC1): A contribution with no body changes nothing, except with `remove`.
- R105 (UC1): A contribution with malformed frontmatter still answers, with a warning and the documented default.
- R7 (UC1): An unknown `merge` value or marker is read as `patch`, with a warning. An explicit marker that matches
  nothing below warns, and its text goes at the end of its parent section (nothing, for `remove`); an unmarked section
  that matches nothing does not warn. A document repeating a heading warns, and the first is matched.

**Stack**

- R8 (UC1, UC7): The highest written `extends` builds the stack: its steps apply bottom first, each bringing its own
  `extends` beneath it, recursively; a plugin both listed and brought in appears once, at its listed place. The highest
  is a managed contribution's, else the `repo` one's, else the `user` one's. With no written `extends` in the managed,
  `repo`, or `user` tiers, the plugins' own `extends` order them, and the default's own `extends` places the default, as
  a plugin's places that plugin. A plugin left unordered makes the name `ambiguous`, with each `<plugin>/<name>` and the
  default as options.
- R53 (UC1, UC7): A plugin or `default` left out of the highest written `extends` is `not used` and does not make the
  name `ambiguous`. A lower contribution's `extends` that builds a different stack is `not used`, with a warning.
- R54 (UC1, UC7): A cycle only plugins wrote makes the name `ambiguous`. A plugin listed at two separate places in a
  written list makes it `ambiguous`. A repeat otherwise resolves silently to one place. A plugin listing itself has that
  entry ignored, with a warning.
- R55 (UC1, UC9): A step not installed, or not holding the name, is skipped with what only it brings in, with a
  warning, and the rest of the stack stands. When every step is missing, the `extends` counts as not written, with a
  warning, and the stack falls through. A `default` step with nothing there is skipped without a warning.
- R113 (UC1, UC9): When the `repo` or `user` `extends` builds the stack, each plugin holding the name that the stack
  leaves out and that contribution does not decline (K35) is `not used`, with a warning naming the plugin and how to
  add it or leave it out. A declined plugin is `not used` with no warning. A managed `extends` that builds the stack
  raises no such warning, since a customizer cannot change it (R109). For a `user` `extends`, only the harness's enabled
  plugins count (R84). A written `extends` with no `declined` declines nothing.
- R106 (UC7): A malformed `extends` counts as not written, with a warning.
- R56 (UC1, UC4): A plugin's contribution answering over the loading skill's default, when no written `extends` names
  the plugin or the default, still answers, with a warning naming the plugin and how to pick. A plugin whose own
  `extends` names `default` has placed the default itself, so the warning does not fire for it.

**Reporting**

- R9 (UC2): The trace reports every layer checked, highest first, with where it came from, the file matched, the
  operation applied and where that came from, and its outcome: used, shadowed (by which contribution), not used (and
  why), not read (and why, a project section in an ignored folder included), stale, ambiguous, or missing. It names the
  detected harnesses. It gives each project section with its folder, and the package plugin that supplied it, and for a
  generated document each recorded source with its recorded and installed plugin versions, and the request.
- R101 (UC1, UC2): At load, a generated `repo` or `user` document, or a project section, is `stale` when a recorded
  source's plugin version differs from the installed one, or a recorded source is gone. It is still used, with a
  warning naming each changed or missing source and how to revise it (UC20). A `user` document records only the
  harness's enabled plugins as sources (R84), so a plugin found only through a repository's `package.json` (R13) is
  never one of its sources, and its absence in another repository never makes the document stale. A plugin's or a
  default's own file that records `sources` is never stale at load: only `check` compares it (R86). A
  contribution that records no sources is never stale.

**Legacy forms (UC1.22)**

- R119 (UC1, E72): A contribution in a legacy form (K37) answers as 2.0 reads it: `merge-sections` and `first-wins`
  read as `patch`, `overrides` changes nothing, a project-folder selection's `extends` is ignored, a skill's
  `references/<name>.md` is not read as its default (UC12.5), and a qualified-name override in the `repo` or `user`
  tier or a project folder is not read; a subfolder holding `README.md` is a reference in folder form, not one. Its
  warning, and its `migrate` row, say that no released version read it, so the override never applied, and that
  applying the plan turns it on. Each raises `reference-legacy-format` in place of the
  `merge-unknown` or `project-section-key-ignored` it would otherwise raise, naming the file, the form, its 2.0 form,
  and `reference migrate`. The default layout warns only when the skill's folder is given and holds no
  `<name>.default.md`. `check` fails the `compose` check on one in the main document, as on any defect (R116).

**Layers**

- R12 (UC1): The layers load in this order: the stack, then `user`, then `repo`, then managed. The `project` tier holds
  the folders below the root. Managed is read for the detected harness only; when detection names no harness, or more
  than one, none is read, and the trace says so. The library keeps no managed folder of its own.
- R13 (UC1, E15): The plugin tier holds, for the detected harness, each enabled plugin's references, and the declared
  dependencies of the root's `package.json` that are plugins and ship references. Any other dependency adds no plugin
  layer, and a `package.json` below the root adds none either: its plugins are package plugins (R115).
- R115 (UC21, E69): A package plugin (K36) declared by a `package.json` in a folder git does not ignore, and by no
  package outside that folder, adds its contribution of a name as a project section for that package's folder, ahead
  of the folder's own section. A plugin the plugin tier holds adds none. Keys the plugin's file carries for the stack
  are left out without a warning.
- R14 (UC1): An interface document is never composed: `extends` and `merge` on it are ignored with a warning, a higher
  contribution of it is ignored with a warning, and the lowest answers; two plugins holding it make it `ambiguous`.
- R15 (UC2, E17): A layer skipped for a reason appears in the trace with that reason and adds no contribution.
- R20 (UC1, UC2, E22): No `governances/` folder is read, in any tier or skill folder.

**Finding**

- R16 (UC3, E18): `list` has one row per name, with its description and, when not `found`, its status and options. With
  a trace, it has one row per name per layer holding it, and one per installed skill holding a default of it. Two
  installed skills of one name in different folders, each holding a default of the name, get a row each: the harnesses
  disagree on which copy runs, so neither is chosen.
- R17 (UC3, E19): `search` gives matches best first. A name resolves as `load` would, and each default as its skill
  loads it, before it is searched; a name a `remove` turned off is left out. Each project section is searched too, and a
  match in one carries its folder.
- R18 (UC3, E20): `list` and `search` with no match give axi's empty answer, an explicit zero; it is not an error.
- R58 (UC3, E48): Defaults are found in the skill folders the detected harness reads. On a harness whose skill folders
  are not verified, no defaults are listed, and the answer says so. Where each harness keeps a plugin's skills:
  `.research/skill-resolution` A and B.

**Renames (UC19)**

- R96 (UC19, E65): `aliases` on a plugin's or a default's contribution of a name, or on an interface document, lists
  older names. A load of an older name resolves the name listing it, with a warning naming it, and a qualified older
  name resolves as the same plugin's new name. Aliases are not followed transitively; an invalid one, or `aliases` in
  any other tier, is ignored with a warning (in a project section, R110). On an interface document, `aliases` lists the
  interface's older ids: after the rename, `implements: <old id>@<version>` resolves to the renamed interface, and the
  names `<old id>` and `<old id>.<key>` follow the alias like any renamed name, each with a warning. For a non-Markdown
  name, the owner lists them in its metadata file (K31).
- R97 (UC19, E65): A contribution filed under an older name in the managed, `repo`, `user`, or `project` tier applies as
  one of the new name, with a warning naming its path and the new name. A file under the new name in the same folder
  wins, and the older one is ignored with a warning.
- R98 (UC19, E65): A name a contribution holds as its own is never read as an alias, with a warning that the alias is
  not used. An alias two names list is `ambiguous`, with both as options. `list` and `search` show only the new name,
  and the trace names the alias used.
- R120 (UC19, E73): A load of a name a plugin's rename table (K38) lists as older, and that no contribution holds as
  its own, warns `reference-renamed`, naming the new name, the plugin, and `reference migrate`. It still answers as
  that name. An entry that is not a pair of valid bare names is ignored, with a `rename-invalid` warning.
- R128 (UC19, E76): An alias on an interface document is also an older name of the document. A load of
  `<old id>.interface` resolves `<id>.interface`. No implementation of a `many` interface is named `<old id>`, so for
  one a load of `<old id>` resolves the interface document too: a plain document that becomes a `many` interface keeps
  its name. For a `one` interface, `<old id>` is the implementation's older name (R96). A file filed under either older
  name in a tier applies as the interface document (R97) and, as an interface is never composed, is reported with
  `interface-not-composed`. `check <older name>` checks the interface document, and `implementations <old id>` lists
  the interface's implementations, each with a `reference-renamed` warning.
