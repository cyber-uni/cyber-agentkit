# Asset

Lists, shows, creates, updates, and deletes the static files in a skill's `assets/` folder, such as templates, schemas, and JSON data a skill points to by path. Plain file operations: no tiers, no merging. It runs the `asset` command from a launcher bundled in `scripts/`, and writes or deletes only after the user approves. Type `/asset` to run it yourself. Installed as a Claude Code plugin, it is `/cyber-agentkit:asset` (pnpm install: `pnpm-cyber-agentkit-asset`).

| Mode | When |
| --- | --- |
| list | see every file under the skill's `assets/` with its size |
| show | read a text asset |
| create | add a new asset; never overwrites |
| update | replace an existing asset |
| delete | remove an asset and any folder it leaves empty |

For a document fetched by name and layered across the managed, project, user, and plugin tiers, use [`/reference`](../reference/README.md).
