---
name: prose-update
description: Use this skill when a section of prose a tool wrote earlier may have been edited by its owner and a newer wording is available, to get recommended updated prose that keeps the owner's sentences. Takes the offered prose, the found prose, and the historic prose.
---

# Update prose

Given a newer wording, the text now in a file, and the wordings the tool retired, recommend the updated text. A script returns the facts that settle most cases. You resolve only what it leaves open. Nothing here writes a file or asks the owner: the calling skill does that with your recommendation.

## Inputs

Exactly three, as text:

1. **Offered prose**: the wording the tool offers now.
2. **Found prose**: the text in the file being updated. It may hold several sections.
3. **Historic prose**: either a history text (entries headed `## Superseded <date> — <reason>`, each wording in a fence) or one or more retired wordings, newest first.

Read no file the caller did not name. If one of the three is missing, say which and stop.

## Run

```sh
node <this skill's folder>/scripts/prose-update.mjs classify --offered-from <file> --found-from <file> --history-from <file> --format json
```

Pass `--offered`, `--found`, or `--history` with the text itself instead of the `-from` form, and `--retired` (repeatable, newest first) in place of a history text. Each of the three takes one form, not both. If the script is missing or cannot run, use `pnpm exec cyber-agentkit prose-update` when the package is a direct dependency, else `npx -y cyber-agentkit@1.2.1 prose-update`, with the same arguments.

An empty offered wording exits 1 with `error: empty-offered`. Report it and stop.

## Read the result

Each part (a heading path and the sentences under it) has an `outcome`:

| Outcome | Recommend |
| --- | --- |
| `up-to-date`, `owners` | the part's `text` as found. Nothing is offered. |
| `update` | the part's `text`, merged by the script: the owner's sentences kept, the offered ones taken. |
| `conflict` | the colliding sentences are in `collisions` (base, found, offered). The part's `text` holds the found sentences there. Resolve by reading intent. |
| `undetermined` | the `reason` says why: `no-history`, `empty-section`, `tied-base`, `no-base`. Resolve by reading intent, or give no recommendation. |

The top-level `text` is the whole document as the script merged it. For `up-to-date`, `owners`, and `update` it is the recommended prose: use it as is and mark no sentence as decided.

## Resolve what the script left open

Only for `conflict` and `undetermined` parts.

- Compare meaning, not wording: is the owner's sentence a rewording of the offered one, or a different point?
- Keep every owner sentence. Drop one only when you mark it `decided` with the reason.
- Mark every sentence you wrote or chose that is not from the found text, the offered wording, or an owner sentence as `decided`, with the reason.
- When you cannot choose, give no recommendation for the part. Name the part and the choice the owner must make.

## Answer

Return the recommended prose, then for each part its outcome, and for each sentence whether it was kept, taken from the offered wording, or decided. Ask the owner a question only for a part that is a `conflict` or `undetermined`, or whose recommendation carries a `decided` sentence.

## Retire a wording

When the tool ships a new wording, add the old one to the history: `node <this skill's folder>/scripts/prose-update.mjs retire --history-from <file> --wording-from <file> --date <date> --reason "<why>"` prints the new history text. Save it only after the user approves. Write new wordings so that they only add sentences after the old ones: such a revision merges without collision.
