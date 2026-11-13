---
"cyber-agentkit": minor
---

`/skill check` adds TRG-9, a warning-level script check: a skill whose body documents the arguments it takes (a
command table whose commands take arguments, an `Arguments:` line or heading, or `$ARGUMENTS`) declares an
`argument-hint` in its front matter, so the harness shows the user what to type. The `skill` skill now carries one.
