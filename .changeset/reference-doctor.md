---
'cyber-agentkit': minor
---

Add the `reference` skill's Doctor mode, `/reference doctor <system>.capabilities`. It runs the capability
reference's Detect, showing each command first and running only those that read, and reports the version and tier
found, each feature whose `Since:` or `Until:` line or support mark disagrees with it, and the Verified entry that
covers it, or that none does. It changes no file, its report is written to be sent to the author as is, and a name
that is not a capability reference is an error before anything runs.

The load procedure now tells a consuming skill what to do when a step fails while following a blueprint: name the
blueprint and its capability reference, and offer the doctor, a report to the author at the plugin's repository, and,
as a stopgap, a patch of the capability reference for this repository.
