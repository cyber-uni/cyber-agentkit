---
"cyber-agentkit": minor
---

`skill check` gives every check a severity, `critical` or `warning`, and shows it on each failure. The new
`--fail-on critical` exits 1 only on a critical failure, so CI can block on those and let warnings through; the
default, `--fail-on any`, still exits 1 on any failure. An aspect implementation names a check's severity as
`- **<ID>** [<how>, warning] <statement>`; a check that names none is critical.
