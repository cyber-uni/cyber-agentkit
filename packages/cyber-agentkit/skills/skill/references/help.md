# Help

Show this list, then ask which command the author wants. Run no script and change no file.

| Command | Does | Use it when | Example |
| --- | --- | --- | --- |
| `help` | lists these commands | you do not know which command fits | `/skill help` |
| `create [description]` | drafts Intent, Criteria, Shape, and Trigger for approval, builds the skill, then checks and tests it | you want a new skill for a job you describe | `/skill create a skill that drafts release notes from merged PRs` |
| `check [skill]` | reads the skill against every aspect's checks, like a linter; changes nothing | you want to know whether a skill as written is sound, without running it | `/skill check release-notes` |
| `test [skill]` | runs the skill's evals: does it fire on the right requests, and does its result meet its Criteria | you want evidence the skill works, beside a run without it | `/skill test release-notes` |
| `fix [skill]` | repairs what `check` or `test` found, and nothing else | `check` or `test` reported failures | `/skill fix release-notes` |
| `enhance [skill] [prompt]` | suggests improvements one at a time, from how the skill was used or your request | the skill passes `check`, and you want it better | `/skill enhance release-notes it misses squash merges` |
| `vet <source>` | fetches a third-party skill to a temporary folder, runs every Security check, and reports an install verdict with who publishes it, its installs, maintenance, and license | you are about to install a skill you do not own | `/skill vet acme/skills/release-notes` |
| `customize [aspect]` | shows which implementation each aspect uses and each command's autonomy, and changes them | your team wants another plugin's checks, or commands to apply more or less on their own | `/skill customize verification` |

To turn work already done (a session, existing instructions, another skill) into a skill, use `/skillify`.
