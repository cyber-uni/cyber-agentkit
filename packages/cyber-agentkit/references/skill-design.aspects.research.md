---
description: The default Research aspect of /skill - before the Intent is final, look for existing skills for the job and check that each target harness can do it, through research-workbench's deep-research.
tags: [skill-design, aspect, research]
implements: skill-design.aspects.research@1
---

## Draft

`create` runs this once the Intent's job and result are drafted, and before Criteria.

1. **Size it.** Take the first that fits:
   - **Full** when the skill ships to others, or its job is one other teams could have. Run the
     `research-workbench:deep-research` skill in Durable mode on the topic `skill-<name>`. When that skill is not
     installed, do the same three parts yourself, write them to `.research/skill-<name>/conclusion.md` with each
     source's URL, and say that `research-workbench` was missing.
   - **Quick** when the job belongs to one repository or one person, such as this repository's own release steps. Do
     the prior-art part alone, and record it in the README (step 4).
   - **Skip** when `/skillify` wrote the description from work already done in this repository, and nothing the job
     needs is new. Record the skip with its reason (step 4).
2. **Research.** Cover three parts, and source every claim; mark a claim you could not verify as unverified.
   - **Idea.** Whether the job is real and the Intent states it correctly: who else has it, and how they describe it.
   - **Feasibility.** For each target harness (every harness the skill names, or Claude Code, Codex, Cursor, and GitHub
     Copilot CLI when it names none): whether it supports what the skill needs, such as tools, hooks, scripts, slash
     commands, or network access, and any limit, cost, or quota that applies.
   - **Prior art.** Existing skills for the job: the skills installed in this session and in the repository's and the
     user's skills folders, the `find-skills` skill or `npx skills find <query>`, the marketplaces the author has
     added, and the guidance the tool the skill drives ships itself. For each one found, its pros and cons against the
     Intent.
3. **Recommend.** End with one of adopt (install the existing skill, after `vet`), extend (change the existing skill,
   through `enhance` when it is the author's), or build, with the reason. When the recommendation is adopt or extend,
   or the research cuts a use case from the Intent, it changes the Intent: stop as `SKILL.md`'s Autonomy says, name
   each existing skill that covers the job, and ask with these options:
   - A: adopt it: `vet` it and install it, and create nothing.
   - B: extend it instead of creating one.
   - C: build the new skill anyway, with the reason the existing one does not do.
   On build, or after the author's answer, record in the research each change to the Intent it caused, or that there
   was none.
4. **Record.** Add a `## Research` section to the skill's `README.md`, after the Intent paragraph:
   - Full: a link to the research record. For a skill that ships to others, link by URL, such as the record's address
     on the repository's host or an issue comment that holds it, since the skill names no file outside its folder.
   - Quick: where you looked and the skills you found, each with the reason this skill is still needed, in five lines
     or fewer.
   - Skip: `Skipped: <reason>`.

## Criteria

- **RES-1** [read] `README.md` has a `## Research` section that links a research record, lists a quick search's
  sources and findings, or records a skip with its reason.
- **RES-2** [read, warning] For each existing skill the research found, the record gives the reason this skill is
  still needed.
- **RES-3** [read, warning] Unless the research was skipped, the record says what the research changed in the Intent, or that it changed nothing.

## Fix

- RES-1: for a skill written before this aspect, add `## Research` with `Skipped: written before the research step`,
  or run Draft from step 1 when the author asks for the research. Otherwise run Draft from step 1.
- RES-2: add the reason for each skill found. When there is none, the recommendation is adopt or extend: stop and ask
  as Draft step 3 says.
- RES-3: add the line to the record.

## Enhance

- A research record older than six months, or one whose sources a vendor has since changed: offer to refresh it with
  `research-workbench:deep-research` in Update mode.
- A skip or a quick search on a skill that now ships to others: offer the full research.
