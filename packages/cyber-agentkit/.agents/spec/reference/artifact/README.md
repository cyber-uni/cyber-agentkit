---
spec-type: behavioral
---

# reference/artifact — the artifact a skill works on contributes to the reference loaded for it

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC24 — Load a reference for one artifact (A1.4, A9.1)

- **Trigger:** a skill works on one artifact, such as one feature's spec, and loads a reference the artifact adds to,
  such as the checklist the spec is judged by.
- **Entry points:** Skill: the `reference` skill's Load mode, from a load line that names the artifact (R89), which runs
  `load` with it. Code: `loadReference` with the artifact.
- **Inputs:** the names; the artifact (K39); the root (K18); the calling skill's folder; the detected harness.
- **Outcome:** each name resolves as UC1 says. The artifact contribution of the name (K40) follows its project sections,
  marked with the artifact's path (R44), and the managed contribution applies over it as over a project section (K27).
  Its waivers (K41) apply as UC25 says. The artifact itself is never changed.
- **Extensions:**
  - UC24.1 The artifact holds no contribution of the name: the name resolves as UC1 says, with no warning.
  - UC24.2 The artifact is outside the root, does not exist, or is not Markdown: nothing is read from it, with a
    warning, and every name resolves without it.
  - UC24.3 The artifact's entry for a name, or one waiver in it, is malformed: that part is ignored with a warning, and
    the rest still applies.
  - UC24.4 The name is not `found`: the artifact adds nothing to it. An artifact never answers a name on its own; a name
    with only project sections is `found` (UC1.16) and gets the artifact contribution.
  - UC24.5 The resolved reference is not Markdown, or is an interface document: the artifact contribution is not
    applied, with a warning.
  - UC24.6 A managed `replace` or `remove`: drops the artifact contribution too, as it drops project sections (UC10.4).
  - UC24.7 A qualified name `<plugin>/<name>`: the artifact still applies, as the `user` and `repo` tiers do (R2).
  - UC24.8 The artifact's text carries a merge marker: the marker is ignored with a warning. Its text only adds; only a
    waiver sets text aside.
  - UC24.9 The entry is filed under an older name (K32): it applies as one of the new name, with a warning naming the
    new name, as R97 says for a tier file.

### UC25 — Waive one section for an artifact (A9.2, A5.6)

- **Trigger:** the artifact's author decides that one section of the reference does not apply to the artifact for now,
  such as a spec waiving one checklist criterion until a dependency ships.
- **Entry points:** Code: a waiver in the artifact's entry for the name (K41). Skill: the `reference` skill's Load mode
  tells the user what each waiver did (R134).
- **Inputs:** the heading path of the section; a reason; an expiry date.
- **Outcome:** in the main document and in each project section, the waived section keeps its heading, and its text, its
  subsections included, gives way to a note that it is waived for this artifact, with the reason and the expiry. The
  managed contribution still applies over the result, so a managed section at that path brings managed text back. The
  trace shows each waiver with its artifact, reason, expiry, and outcome, and structured output lists each one applied.
- **Extensions:**
  - UC25.1 The waiver lacks a reason or an expiry, or its expiry is not a date: not applied, with a warning.
  - UC25.2 The expiry has passed: not applied, and the section stands, with a warning naming the waiver and its expiry,
    so the author renews or removes it.
  - UC25.3 The heading path matches no section: nothing changes, with a warning.
  - UC25.4 The artifact also adds text at the waived path: its text follows the note, so changing a section is a waiver
    plus the text that takes its place.
  - UC25.5 The section must not be lowered: a higher tier keeps it, or it judges the artifact itself. Open: Q15.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Artifact contributions (UC24)**

- R129 (UC24, E77): A load names at most one artifact, and it applies to every name loaded. An artifact outside the
  root, missing, or not Markdown is not read, with a warning, and every name still resolves.
- R130 (UC24, E78): A `found` Markdown name, not an interface document, that the artifact holds an entry for gets the
  artifact contribution after its project sections. Structured output gives it as its own record with the artifact's
  path, apart from the main document and the project sections. A name not `found` gets none and raises no warning for
  it; a non-Markdown or interface name gets none, with a warning.
- R131 (UC24): The managed contribution applies over the artifact contribution as over a project section (R99), and a
  managed `replace` or `remove` drops it.
- R132 (UC24): Text in the artifact contribution never drops or replaces text of the main document or a project section;
  a merge marker in it is ignored with a warning. A malformed entry or waiver is ignored with a warning, and the rest of
  the entry applies.

**Waivers (UC25)**

- R133 (UC25, E79): A waiver with a heading path, a reason, and an expiry not yet passed replaces the text of the
  matching section, in the main document and in each project section, with a note naming the artifact, the reason, and
  the expiry; the heading stays. A waiver missing a reason or an expiry, with an expiry that is not a date or has
  passed, or matching no section changes nothing, with a warning naming it.
- R134 (UC25, E80): The trace reports each waiver with its artifact, reason, expiry, and outcome, and structured output
  lists each applied waiver. Load tells the user each waiver applied, with its reason and expiry, and each one not
  applied, with why. The second sentence is behavior of the skill's text (C5), checked as the skill's criteria are.

## Open questions

- Q14 (issue Q3) Where in the artifact its contribution lives. Options: (a) all in frontmatter, under one key per name;
  (b) waivers in frontmatter, and the added text in a section of the artifact's body that the frontmatter names by
  heading path; (c) a reserved heading in the body. Recommended: (b). Waivers are records with fields, which frontmatter
  holds well, and the issue already puts them there; added text is prose with headings, which YAML holds badly, and
  naming the section keeps the artifact's own layout free.
- Q15 (issues Q2 and Q4) How load knows a section must not be waived. Load cannot tell on its own which criterion
  judges the artifact itself, and nothing can lock a section today. Options: (a) a section marker that any contribution
  below the artifact may place, which makes a waiver of that section, or a section under it, not applied, with a
  warning; (b) a frontmatter key on a contribution that turns waivers off for the whole name; (c) no lock in this issue,
  leaving self-reference to the consuming skill. Recommended: (a). One checklist mixes criteria an artifact may set
  aside with ones that judge the artifact itself, such as a spec-quality check; the author of such a criterion locks
  it, and a repository locks a rule it must keep. The lock binds only waivers, not the tiers that patch it.
- Q16 How the artifact's text ranks against the reference where they conflict (R90). Today R90 ranks a single
  feature's own document over the resolved reference, managed text included, so a spec could set a criterion aside in
  its prose without a waiver, and above the managed tier. Options: (a) keep R90, and rank the artifact contribution
  over the project sections and the main document; (b) when a load names the artifact, its say over the reference is
  only its contribution: where its text conflicts with the resolved reference, the reference wins unless a waiver set
  the section aside. Recommended: (b). It keeps the managed tier above the artifact (issue Q1), makes a waiver the only
  way to lower the bar (issue Q2), and still lets the artifact add freely.

## References

- Request and the questions it raised: issue #137, from a comment on #110.
- Where the artifact's contribution sits among the tiers (K1, K28): issue #137's first use case and its Q1.
