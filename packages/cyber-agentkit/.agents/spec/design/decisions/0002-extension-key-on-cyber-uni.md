# 0002 — The plugin-manager extension key is io.github.cyber-uni.plugin-manager

**Status:** accepted (2026-10-20). Supersedes the extension key in
[0001](0001-dependency-listing-and-doctor.md); the rest of 0001 stands.

- A plugin authors its dependency list in its root `plugin.json` under
  `extensions["io.github.cyber-uni.plugin-manager"]`, replacing `org.spikyuni.plugin-manager`.
- The agent line moved from the spikyuni org to cyber-uni, so the key follows the org.
- Agent Plugins 1.0.0 section 8 asks for a namespace on a domain the client controls. The key reverses
  `cyber-uni.github.io`, which the org controls, and adds the client name, as the spec's own example
  turns `example.com` into `com.example.client`.
- The last segment names the feature, not the package. The package has been renamed several times, and the
  spec asks a namespace to stay stable, so a feature name outlives the next rename.
- One key per feature. Each tool replaces its own key without touching another's, and the spec's rule that
  a client ignores namespaces it does not implement keeps working.
- Rejected:
  - `org.cyberuni.plugin-manager` and `org.cyber-uni.plugin-manager`: no one has verified that the org owns
    `cyberuni.org` or `cyber-uni.org`.
  - `io.github.cyber-uni.cyber-agentkit`: names the package, so it breaks when the package is renamed.
  - One shared `io.github.cyber-uni` key with a sub-object per feature (`plugin-manager`,
    `project-tracker`). The spec defines no merge, so every tool that writes the manifest would have to
    merge two levels deep, and one that replaces the shared object drops the other features. It also makes
    the whole org one client that must own the list of sub-keys.
- `org.spikyuni.plugin-manager` is not read as a fallback: no release shipped it.
  `org.cyberuni.universal-plugin` stays the fallback, as 0001 says.
- This key is expensive to change once a release ships it.
