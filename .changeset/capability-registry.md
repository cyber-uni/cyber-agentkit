---
"cyber-agentkit": minor
---

Add a capability registry beside the interface registry. Each entry is one system, `registry/capabilities/<system>.md`,
listing the plugins that ship its capability reference and the blueprints built on it.
`reference register <system>.capabilities` looks the system up and opens a pull request or an issue adding it, with
`--plugin` and `--blueprint`. Registering stays optional, and loading never reads the registry. The library exports
`parseCapabilityEntry`, `readCapabilityRegistry`, `lookupCapability`, and their companions.
