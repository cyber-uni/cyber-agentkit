# Changes: skill-design-interface

## 2026-11-05

- Created the topic from issue #153. Surveyed the five sources the issue listed as unread (Vercel skills CLI, plugin-dev skill-development, autoharness, one-skill-to-rule-them-all, Memento-Skills). The aspect list gains Distribution and Lifecycle; A11 has one piece of partial prior art. Recorded the owner's ownership decision (O1) and the `/skill` routing skill. First version, no prior conclusion to change.

## 2026-11-05 (later)

- Recorded the owner's answers: Q1 many interfaces, Q2 handled by extending `reference customize` to a family of references by wildcard, Q4 cyber-agentkit ships a default for every aspect with aced and universal-plugin as advanced customizations (tentative change to the ownership split), Q7 gradual, Q9 open. Read the reference feature: required sections, versions, and one-or-many already exist; customize is per name; a dot-separated aspect name may collide with the many-implementations naming. Conclusion's ownership table not yet revised, pending confirmation.

## 2026-11-05 (ownership and Q9)

- Ownership simplified: cyber-agentkit owns contracts, defaults, scan helper, and the `/skill` front door; aced and universal-plugin are extenders only. Q9 settled as pre- and post-conditions per aspect; the rebelytics precedence rule is withdrawn. Conclusion materially changed (ownership table, verdict items 3 and 4).

## 2026-11-05 (naming)

- Resolved the aspect naming collision: ids may contain dots, a one-implementation interface matches only its exact id, and no interface named for the family exists. Wildcard over a family is new work. Deferred the aced authoring-skills question.

## 2026-11-05 (commands)

- Recorded the `/skill` commands (create, check or doctor, fix or improve, enhance) and the closed-versus-open aspect split. Q5 and Q6 closed: scan is a helper, not a mode.

## 2026-11-05 (names)

- Settled the command names (create, check, fix, enhance) and the core-versus-open split as a convention in the `/skill` text, not an interface field.
