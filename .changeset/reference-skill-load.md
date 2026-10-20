---
"cyber-agentkit": minor
---

The `reference` skill follows the stack design. Load passes the calling skill's folder as `--default`, so a skill's defaults now live at `references/<name>.default.md` and sit below every customization; it reads a default by itself only when the command cannot run, and no longer reads `references/<name>.md` or `governances/`. On an ambiguous name with a user present, it lists every option, asks for a pick, and writes it with `reference select`. An invalid name is reported as a fault for the calling skill's author. A new Select mode chooses what a name builds on, and Update writes customizations that patch, instead of `merge-sections` overrides. The load line reads "with the `reference` skill of `cyber-agentkit`".
