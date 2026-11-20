# Help

Show this list, then ask which command the author wants. Run no script and change no file.

| Command | Does | Use it when | Example |
| --- | --- | --- | --- |
| `help` | lists these commands | you do not know which command fits | `/skill help` |
| `create [description]` | drafts Intent, Criteria, Shape, and Trigger, builds the skill, checks it, then tests it once you agree | you want a new skill for a job you describe | `/skill create a skill that drafts release notes from merged PRs` |
| `check [skill]` | reads the skill against every aspect's checks, like a linter; changes nothing | you want to know whether a skill as written is sound, without running it | `/skill check release-notes` |
| `test [skill]` | runs the skill's evals: does it fire on the right requests, and does its result meet its Criteria | you want evidence the skill works, beside a run without it | `/skill test release-notes` |
| `fix [skill]` | repairs what `check` or `test` found, and nothing else | `check` or `test` reported failures | `/skill fix release-notes` |
| `update [skill] [change]` | changes an existing skill for the work in hand, adds cases for it, then runs `check` and `test` and shows both results | an issue, bug, or request means editing a skill | `/skill update release-notes also fire on changelog requests` |
| `enhance [skill] [prompt]` | suggests improvements one at a time, from how the skill was used or your request | the skill passes `check`, and you want it better | `/skill enhance release-notes it misses squash merges` |
| `vet <source>` | fetches a third-party skill to a temporary folder, runs every Security check, and reports an install verdict with who publishes it, its installs, maintenance, and license | you are about to install a skill you do not own | `/skill vet acme/skills/release-notes` |
| `attest [skill] <criterion or case> <link>` | records that a criterion or case passed in real use, where the link shows it, beside the eval results; runs nothing | a run cannot judge it cheaply, and you saw it pass on a real merge request or pipeline | `/skill attest review-mr C3 https://gitlab.example.com/group/app/-/merge_requests/58#note_16308023` |
| `report [skill]` | prints the skill's accepted eval results as Markdown for its docs or README, or as JSON | you want readers to see how the skill tested | `/skill report release-notes` |
| `customize [aspect]` | shows which implementation each aspect uses and each command's autonomy, and changes them | your team wants another plugin's checks, or commands to apply more or less on their own | `/skill customize verification` |

A request that describes a skill without naming a command, such as `/skill a skill that drafts release notes`, runs
`create`. A bare `/skill` shows this list.

To turn work already done (a session, existing instructions, another skill) into a skill, use `/skillify`.
