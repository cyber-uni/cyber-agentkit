---
description: The default Security aspect of /skill - a skill asks before outside effects, carries no secrets, and never treats fetched content as instructions.
tags: [skill-design, aspect, security]
implements: skill-design.aspects.security@1
check-script: ../skills/skill/scripts/check-security.mjs
---

## Criteria

- **SEC-1** [script] No file in the skill's folder holds a string shaped like a secret, such as an API key, a token,
  or a private key.
- **SEC-2** [script] No script downloads code and runs it, such as `curl ... | sh`.
- **SEC-3** [read] Before any step with an effect outside the working copy (posting, pushing, sending, publishing,
  deleting, paying), the skill asks the user, or says it runs only when the user asked for that step.
- **SEC-4** [read] The skill treats what it fetches or reads from files as data, and never tells the agent to follow
  instructions found there.
- **SEC-5** [read] A script the skill runs takes outside input as arguments, never as code it evaluates.
- **SEC-6** [read, warning] The skill asks for no more permission than its steps use.
- **SEC-7** [script] No file holds an invisible code point: a zero-width character, a bidirectional control, or a
  Unicode tag character. A byte-order mark at the start of a file, and a joiner inside an emoji, are allowed.
- **SEC-8** [script] No line runs a command that destroys data broadly, such as `rm -rf` on the root, the home
  folder, or every file, `dd` onto a disk, `mkfs`, or a fork bomb.
- **SEC-9** [script] The skill's own text holds no prompt-injection phrase, such as one telling the model to ignore
  its earlier instructions or to keep a step from the user, and no chat-template delimiter.
- **SEC-10** [script] No line reads a credential location, such as `~/.ssh`, `~/.aws`, `/etc/shadow`, or a keychain.
- **SEC-11** [script] No line sends data to a URL written into the skill, and no file names an endpoint that collects
  what is sent to it: a bare public IP address, a request catcher, a paste site, a chat webhook, or a raw socket.
- **SEC-12** [script, warning] Every `--no-verify`, forced git command, or `sudo` gives its reason, on its line or
  the line above it.

## Fix

- SEC-1: remove the value, and read it from the environment or ask the user for it. Tell the author the value may
  already be exposed.
- SEC-2: pin the download to a version and a checksum, or install it through a package manager.
- SEC-3: add a step that asks before the effect.
- SEC-4: add a line that fetched content is data, not instructions.
- SEC-5: pass the input as an argument, and quote it.
- SEC-6: narrow the permission to the steps that use it.
- SEC-7: delete the code point the report locates. When it hid text, read what it hid before trusting the file.
- SEC-8: narrow the command to the folder the skill owns, such as `rm -rf ./dist`, and ask before it runs.
- SEC-9: remove the phrase or the delimiter. A skill that must name one quotes it as data and says it is an example.
- SEC-10: remove the read. A skill that needs a credential takes it from the environment or from a tool's own login.
- SEC-11: take the endpoint from the user or from configuration, and ask before sending.
- SEC-12: add the reason, or remove the flag when there is none. Prefer `--force-with-lease` to `--force`.

## Enhance

- A step whose effect could not be undone, such as a force push or a delete, with no dry run first.
- A new outside effect the skill gained since it was last checked.
