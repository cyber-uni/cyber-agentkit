---
spec-type: behavioral
---

# history — the wordings a tool has retired are read from and added to a history text

Part of [prose-merge](../README.md); its terms (K3 history, K1 to K2 wordings) and actors apply here.

## Use cases

### UC3 — Read and extend the history (A1.1)

- **Trigger:** a skill passes a history text to read, or a wording author retires a wording.
- **Entry points:** Code: `parseHistory`, `retire`.
- **Inputs:** the history text; for `retire`, also the outgoing wording, a date, and a reason.
- **Success:** the wordings parsed in order, newest first; or the history text returned with the outgoing wording added at
  the top and every other byte unchanged.
- **Extensions:**
  - UC3.1 A heading or fence does not parse: that entry is reported, the others are returned.
  - UC3.2 The outgoing wording equals the newest retired one: nothing is added.

## Criteria

**History** (UC3)

- R11 `parseHistory` takes text and returns each retired wording as text, date, reason, newest first. An entry that does
  not parse is returned in `invalid` with its position; the rest are returned.
- R12 `retire` takes the history text, the outgoing wording, a date and a reason, and returns the history text with the
  wording, the date text exactly as given, and the reason added at the top and every other byte unchanged. The wording equal to the newest retired one changes nothing.
- R13 `parseHistory(retire(h, w))` returns `w` first, exactly.
- R27 The history text starts from the `buddy-agent-harness` shape (a dated `Superseded` heading with a reason, then the
  wording in a Markdown fence); a change to it is a spec change.

## Open questions

None.
