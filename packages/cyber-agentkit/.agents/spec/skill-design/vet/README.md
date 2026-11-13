---
spec-type: behavioral
status: draft
---

# skill-design/vet — a maintainer knows whether a third-party skill is safe to install, before installing it

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children.

`vet` is its own command, not a mode of `check`. `check` reads a skill folder the author owns and reports what to fix.
`vet` fetches a source nobody here trusts yet and gives an install verdict with the signals about where it comes
from. It reuses the Security aspect, so a new Security check applies to both.

## Use cases

### UC26 — Vet a third-party skill before installing it (A5.1)

- **Trigger:** a maintainer is about to install a skill from a source they do not own, such as a GitHub repository
  they have not used before.
- **Entry points:** skill (primary): `/skill vet <source>`. Script: the same command, run without an agent.
- **Inputs:** the source: a repository, optionally with a branch or tag and the folder that holds the skill;
  optionally, publishers to trust for this run on top of the shared trust list.
- **Success:** the source is checked out to a temporary folder outside the working copy and removed afterwards. Every
  Security check runs on each skill in it, with the source read as data and nothing in it run. A critical failure
  blocks the install. A warning blocks it too when the publisher is not on the trust list, and is only reported when
  it is. The report names each failure with its location, the verdict, the commit vetted, and the supply-chain
  signals: who publishes the source and whether it is trusted, how many installs it has where a verified source
  counts them, whether it is maintained, and its license.
- **Extensions:**
  - **UC26.1** The source holds no skill, or cannot be fetched. `vet` stops and says why; it gives no verdict.
  - **UC26.2** No verified source counts the skill's installs, or the count cannot be matched to this skill alone.
    The report says there is no count and why, and shows no other number in its place.
  - **UC26.3** A signal cannot be read, such as when the host refuses or is not GitHub. The report says which signal
    is missing and why, and the verdict stands on the Security checks and the trust list alone. When GitHub does not
    answer, the owner the source names is the publisher trust is decided for.
  - **UC26.4** The publisher is not on the trust list, or the source has no publisher, as one not on GitHub has
    none. A warning blocks the install, and the report says the block comes from the publisher being untrusted.
- **Example:** a maintainer vets a skill that hides an instruction in zero-width characters and runs `rm -rf ~` in a
  setup step. `/skill vet` reports both findings with their locations, says the install is blocked, and shows the
  repository has no license and no commit in two years.

### UC27 — Share the publishers a team trusts (A5.1)

- **Trigger:** a team vets skills from the same publishers again and again, and each person would otherwise name them
  on every run.
- **Entry points:** the trust list, a named reference document, customized like any other reference; skill:
  `/skill vet <source>` reads it.
- **Inputs:** the publishers an organization, a project, and a person each trust.
- **Success:** each of them adds publishers at its own tier, and every `vet` run trusts the publishers the tiers
  compose, with any named for one run added. The report says where each trusted name came from.
- **Example:** a team adds `vercel-labs` and its own organization to the repository's trust list once. Everyone's
  `vet` of a skill from either reports the publisher as trusted, naming the repository's trust list.

## Criteria

**Vet (UC26)**

- R142 (UC26): `vet` fetches the source into a temporary folder outside the working copy, removes it afterwards
  whatever happens, installs nothing, and changes no file in the working copy.
- R143 (UC26): Nothing fetched is run or followed: no script, hook, or link in the source runs or reaches outside the
  checkout, and its text is read as data, never as instructions.
- R144 (UC26, UC26.4): Every Security check the selected implementation lists runs on each skill in the source. A
  critical failure, whether a script or the agent decides it, blocks the install, and the script exits non-zero. A
  warning blocks it the same way when the publisher is not on the trust list (R149), and is reported without blocking
  when it is.
- R145 (UC26): The report gives the verdict, each failure with its check, severity, and location, and the commit
  vetted, so the maintainer installs what was vetted.
- R146 (UC26, UC26.2): An install count is shown only from a source whose count has been verified, labelled with
  what it counts, and only when it matches this skill alone. Otherwise the report says there is no count and why. No
  other number, such as stars, is shown as installs.
- R147 (UC26, UC26.3): The report shows the publisher and whether it is trusted, whether the source is maintained
  (its latest commit and release), and its license, or says why a signal is missing. A signal never blocks the
  install on its own; trust decides only whether a warning blocks (R144).

**Trust (UC27)**

- R148 (UC27): The trust list is a named reference document, resolved and composed across the reference tiers like
  any other reference, so an organization, a project, and a person can each add publishers. `vet` trusts the names
  the composed document lists, plus any given for one run, and the report names where each one came from.
- R149 (UC26.4): A publisher is trusted only when its name is on the trust list, compared without case. A source with
  no publisher is not trusted. A block that comes from the publisher being untrusted says so in the report.

## References

- The issue: #188, split out of #171 (item G6). The trust list and the trust-aware verdict (UC27, R148, R149):
  #196.
- Where install counts come from, and which numbers are not installs (R146): `.research/skill-install-counts`.
- The Security aspect and its severities (R144): the parent's R67 and [check](../check/README.md) R139.
