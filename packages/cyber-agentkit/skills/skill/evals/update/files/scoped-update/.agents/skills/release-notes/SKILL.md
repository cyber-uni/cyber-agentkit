---
name: release-notes
description: Write or audit the release notes for a release from its merged pull requests. Asked as "write the release notes", "draft the changelog for 2.0", or "check the release notes".
argument-hint: "<command>"
---

# Release notes

Route the request to one command, load its file, and follow it.

| Command | Use it when | Instructions |
| --- | --- | --- |
| `write` | the notes for a release are to be written | [write.md](references/write.md) |
| `audit` | notes already written are to be checked | [audit.md](references/audit.md) |

## Done when

Before reporting done, check each of these against the result. Report any that fails.

- **C1.** `RELEASE_NOTES.md` starts with a `## Release notes` heading.
- **C2.** Each problem the audit reports names the line it is on.
