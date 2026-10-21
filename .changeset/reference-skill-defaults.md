---
"cyber-agentkit": minor
---

`reference list`, `search`, and `check` find skills' defaults (`<skill>/references/<name>.default.md`) in the skill folders the detected harness reads: its project and user folders, its machine-wide admin folders, and each enabled plugin's skills, on Claude Code, Cursor, Codex, Copilot CLI, OpenCode, and Gemini CLI. A skill is known by its `SKILL.md` name, and symlinked skill folders are followed, so skills pnpm or `npx skills` linked are found. `list --trace` gives a row per skill holding a default, noting that the `default` step reaches it when that skill loads the name; `search` and `check` take each default as its skill loads it, naming the skill as `loadedBy`. On another harness, or with none detected, the answer's `defaults` field says why no default is listed. The library exports `harnessSkillFolders`, `pluginSkillFolders`, `adminSkillFolders`, `skillsIn`, and `skillName`.
