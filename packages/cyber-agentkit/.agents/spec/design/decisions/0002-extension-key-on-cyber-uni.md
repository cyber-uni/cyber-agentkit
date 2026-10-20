# 0002 — The plugin-manager extension key is io.github.cyber-uni.plugin-manager

**Status:** accepted (2026-10-20). Supersedes the extension key in
[0001](0001-dependency-listing-and-doctor.md); the rest of 0001 stands.

- A plugin authors its dependency list in its root `plugin.json` under
  `extensions["io.github.cyber-uni.plugin-manager"]`, replacing `org.spikyuni.plugin-manager`.
- The agent line moved from the spikyuni org to cyber-uni, so the key follows the org.
- Agent Plugins 1.0.0 section 8 asks for a namespace on a domain the client controls. The key reverses
  `cyber-uni.github.io`, which the org controls, and adds the client name, as the spec's own example
  turns `example.com` into `com.example.client`. `org.cyber-uni` was rejected because the org does not own
  `cyber-uni.org`.
- `org.spikyuni.plugin-manager` is not read as a fallback: no release shipped it.
  `org.cyberuni.universal-plugin` stays the fallback, as 0001 says.
- The spec asks a namespace to stay stable, so this key is expensive to change once a release ships it.
