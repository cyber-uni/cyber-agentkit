# 0002 — The plugin-manager extension key is org.cyberuni.plugin-manager

**Status:** accepted (2026-10-20). Supersedes the extension key in
[0001](0001-dependency-listing-and-doctor.md); the rest of 0001 stands.

- A plugin authors its dependency list in its root `plugin.json` under
  `extensions["org.cyberuni.plugin-manager"]`, replacing `org.spikyuni.plugin-manager`.
- The agent line moved from the spikyuni org to cyber-uni, so the key leaves the spikyuni namespace.
- The key shares the `org.cyberuni` prefix with `org.cyberuni.universal-plugin`, the fallback this library
  already reads, so the agent line's extension keys sit under one prefix.
- `io.github.cyber-uni.plugin-manager` was rejected. It reverses `cyber-uni.github.io`, which the org
  controls, as Agent Plugins 1.0.0 section 8 asks, but it would split the keys across two prefixes. Whether
  the owner controls `cyberuni.org` is unverified.
- `org.spikyuni.plugin-manager` is not read as a fallback: no release shipped it.
  `org.cyberuni.universal-plugin` stays the fallback, as 0001 says.
- The spec asks a namespace to stay stable, so this key is expensive to change once a release ships it.
