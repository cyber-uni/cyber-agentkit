---
"cyber-agentkit": minor
---

Researched installed signals for the Cursor IDE and Copilot in VS Code, which have no headless command. Every candidate (a `cursor` or `code` command, app, user-data, and extension folders) was checked against vendor sources and rejected, so `installedHarnesses()` still reports neither. The harness detection page now states what `running`, `environment`, and `installed` mean and which harnesses cannot be found installed.
