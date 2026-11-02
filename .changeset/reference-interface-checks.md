---
"cyber-agentkit": major
---

Interface sections are now `{heading, required, holds}` (or a plain heading), and `check` fails a required section that is left out or marked `**Unsupported.**`; the old `- <heading>: required` form fails the `interface` check with the new form in its message. Check names are kebab-case (`interface found` is now `interface-found`), with new `kind` and `required` checks; `compose` fails only on defects in the document itself, and `check` passes environment warnings on, warns of hidden `repo`, `user`, and project-section files and of a moved base (`base-moved`), and lists them under `warned`. `implementations` pins a plugin's implementation by its qualified name, lists a `repo` or `user` one by its bare name and leaves out the plugin's of that name, and leaves out plugins holding one name until a customizer picks one.
