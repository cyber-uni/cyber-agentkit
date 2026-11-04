# reference/artifact — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

| Edge | Decision | Outcome |
| --- | --- | --- |
| E77 | the load names an artifact: a Markdown file inside the root? | read for every name loaded; otherwise not read, with a warning, and every name resolves without it |
| E78 | the name is `found`, Markdown, not an interface document, and the artifact holds an entry for it? | its contribution follows the project sections, with managed applied over it; a non-Markdown or interface name gets none, with a warning; a name not `found` gets none |
| E79 | a waiver with a heading path, a reason, an expiry not yet passed, and a matching section? | that section's text gives way to a waiver note, in the main document and each project section; otherwise nothing changes, with a warning |
| E80 | a waiver read | in the trace with its outcome; an applied one listed in structured output and told to the user |
