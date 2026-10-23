# Update prose

Recommends updated prose for a section a tool wrote earlier and its owner may have edited. A caller hands over the offered prose, the found prose, and the historic prose (the wordings the tool retired). A script compares them sentence by sentence and returns, for each part, whether the found text is current, which retired wording it descends from, which sentences are the owner's, and the merged text or the exact sentences that collide. The skill reads those facts and resolves only what they leave open, marking every sentence it decided. It runs the `prose-merge` command from a launcher bundled in `scripts/` and writes no file. Type `/prose-update` to run it yourself. Installed as a Claude Code plugin, it is `/cyber-agentkit:prose-update` (pnpm install: `pnpm-cyber-agentkit-prose-update`).

| Input | What |
| --- | --- |
| Offered prose | the wording the tool offers now |
| Found prose | the text in the file being updated |
| Historic prose | a history text of retired wordings, or one or more retired wordings, newest first |

| Outcome | Meaning |
| --- | --- |
| `up-to-date` | the found part already holds the offered wording |
| `update` | merged: the owner's sentences kept, the offered ones taken |
| `owners` | the part is the owner's own; nothing is offered |
| `conflict` | both sides changed the same sentences differently |
| `undetermined` | the facts do not settle it: no history, an empty section, a tied or missing base |

It ships in the `cyber-agentkit` plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```
