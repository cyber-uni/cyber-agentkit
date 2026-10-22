# Asset

Lists, shows, creates, updates, and deletes the static files in a skill's `assets/` folder, such as templates, schemas, and JSON data a skill points to by path. By path: plain file operations with no tiers and no merging. By name: loads a file through the managed, project, user, and plugin tiers (the skill's own file is the default), so a plugin, the project, or the user can override which one a skill uses by placing its own. Nothing merges or extends. It runs the `asset` command from a launcher bundled in `scripts/`, and writes or deletes only after the user approves. Type `/asset` to run it yourself. Installed as a Claude Code plugin, it is `/cyber-agentkit:asset` (pnpm install: `pnpm-cyber-agentkit-asset`).

| Mode | When |
| --- | --- |
| list | see every file under the skill's `assets/` with its size |
| show | read a text asset |
| create | add a new asset; never overwrites |
| update | replace an existing asset |
| delete | remove an asset and any folder it leaves empty |
| load, names, where, select | resolve an asset by name through the tiers, list names, show where an override goes, and choose which plugin's file answers a name several hold |

For a document fetched by name and layered across the managed, project, user, and plugin tiers, use [`/reference`](../reference/README.md).
