# Release notes

Writes the release notes for a release from the merged pull requests listed in `prs.json`, into `RELEASE_NOTES.md`. A
maintainer asks for it when cutting a release, and gets each change grouped under Features or Fixes. Not for
summarizing one pull request for review.

## Research

Quick: looked in this repository's and the user's skills folders and with `npx skills find release notes`. Found
no skill that reads `prs.json`; the generic changelog skills found write from git tags, and this job starts from
the merged pull requests a release lists. The research changed nothing in the Intent.
