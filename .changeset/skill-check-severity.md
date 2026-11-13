---
"cyber-agentkit": minor
---

`skill check` gives every check a severity, `critical` or `warning`, and shows it on each failure. It now
exits 1 only on a critical failure, so CI blocks on those and lets warnings through; `--fail-on any` restores the
exit on any failure. An aspect implementation names a check's severity as
`- **<ID>** [<how>, warning] <statement>`; a check that names none is critical.
