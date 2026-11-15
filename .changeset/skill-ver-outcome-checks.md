---
"cyber-agentkit": minor
---

The default Verification aspect of `/skill` says that an eval check tests what the outcome left behind: files changed
or unchanged, a report present, options listed, or a skill called. It never tests one exact phrasing or a punctuation
mark. A check that reads the reply's wording accepts the ways of saying the same thing, and a `not-` check matches only
what the criterion rules out. VER-10 (read) asks this of every check. VER-11 (script, warning) flags a `contains`,
`not-contains`, `regex`, or `not-regex` check that is a punctuation mark alone, such as `regex: "\\?"`.
