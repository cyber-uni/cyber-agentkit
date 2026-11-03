# 0004 — A written `extends` records the plugins it left out

**Status:** accepted (2026-11-03), for #131. The design lives in the [reference spec](../../reference/README.md)
(K35, R113, R114); this record keeps the reasons. It closes the follow-up that [0003](./0003-generated-scoped-references.md)
left open: a plugin installed after a customizer's pick is left out without a word.

- **Record what was declined, beside `extends`.** A written `extends` records only what it uses, so load cannot tell a
  plugin installed after the pick from one left out on purpose. Writing the picks now also records, in `declined`,
  every plugin that held the name then and the stack leaves out. Load warns about a plugin that holds the name and is
  in neither list. The record sits in the file that holds the `extends`, because the decision belongs to that pick.
- **Writing the same picks again declines a newcomer.** Picks are recomputed against the plugins installed when they
  are written, so a customizer who wants to leave the new plugin out runs the same picks once. No separate flag is
  needed.
- **No warning when a managed `extends` builds the stack.** The customizer cannot change that stack (R109), so a
  warning would ask for something they cannot do.
- **A written `extends` with no `declined` declines nothing.** Generated references shipped in #135 just before this,
  so few such files exist; each warns once until its picks are written again.
- Rejected:
  - Recording every plugin seen at pick time (`seen`): it holds the same facts, but the file no longer says what was
    left out, so it is harder to read and to edit.
  - Comparing a plugin's install time with the time the document was written: harnesses do not record install times
    reliably, so load would guess.
