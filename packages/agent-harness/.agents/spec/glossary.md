# Glossary — agent-harness

- **harness** — an AI-agent runtime such as Claude Code, Cursor, Codex, or GitHub Copilot CLI.
- **plugin** — a bundle of skills, agents, hooks, or references that a harness installs from a marketplace.
- **dependency** — a plugin that another plugin says must be present for it to work.
- **declared dependency** — a dependency listed in the plugin's own manifest.
- **doctor** — a read-only check that reports what is wrong and what the user can do. It changes nothing.
- **extension key** — a reverse-domain name under `extensions` in the root `plugin.json` that holds one tool's data
  (Agent Plugins 1.0.0, section 8). For plugin management it is `org.spikyuni.plugin-manager`.
- **reference** — a Markdown document an agent reads by name, layered across tiers.
- **declaring marketplace** — the marketplace the declaring plugin was installed from. A dependency with no marketplace
  resolves only there, as in Claude Code.
- **AXI** — Agent Experience Interface, a convention for CLIs that agents call: structured output on stdout, exit 0 for
  success, 1 for an error, 2 for a usage error (kunchenguid/axi).
- **cross-marketplace dependency** — a dependency in a different marketplace from the declaring plugin's. Claude Code
  installs it only if the root marketplace lists it in `allowCrossMarketplaceDependenciesOn`.
