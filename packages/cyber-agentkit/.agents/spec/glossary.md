# Glossary — cyber-agentkit

- **harness** — an AI-agent runtime such as Claude Code, Cursor, Codex, or GitHub Copilot CLI.
- **plugin** — a bundle of skills, agents, hooks, or references that a harness installs from a marketplace.
- **dependency** — a plugin that another plugin says must be present for it to work.
- **declared dependency** — a dependency listed in the plugin's own manifest.
- **doctor** — see [Verbs](#verbs).
- **extension key** — a reverse-domain name under `extensions` in the root `plugin.json` that holds one tool's data
  (Agent Plugins 1.0.0, section 8). For plugin management it is `io.github.cyber-uni.plugin-manager`.
- **reference** — a document an agent reads by name: Markdown, or a JSON, YAML, TOML, or text file. Its tiers are in
  [reference](reference/README.md).
- **declaring marketplace** — the marketplace the declaring plugin was installed from. A dependency with no marketplace
  resolves only there, as in Claude Code.
- **AXI** — Agent Experience Interface, a convention for CLIs that agents call: structured output on stdout, exit 0 for
  success, 1 for an error, 2 for a usage error (kunchenguid/axi).
- **cross-marketplace dependency** — a dependency in a different marketplace from the declaring plugin's. Claude Code
  installs it only if the root marketplace lists it in `allowCrossMarketplaceDependenciesOn`.

## Verbs

The skills and commands across these plugins reuse a set of verbs. Each verb below has one meaning, and a skill or
command whose name carries it does that job. This glossary section is the one home for the verbs: the documentation
site's Verbs and skill names page is generated from it.

### Verbs that examine and change nothing

- **check** — static analysis at development time. A script reads files and gives a pass or fail. `reference check`
  composes each name as `load` does, so for a reference, checking it and examining it here are the same thing, and
  `reference` has no `doctor`. A reference's variants, such as its GitHub and GitLab defaults, are covered by test
  cases, not by another verb.
- **lint** — run a linter: rules on style and suspicious patterns in source code, such as Biome or ESLint. It is one
  kind of check, narrower than `check`, which confirms an artifact meets its contract: a skill against its aspects, a
  reference against its interface, a manifest against its schema. A linter's own fix mode writes; a run named `lint`
  or `check` does not.
- **review** — a reader's judgment of the work, giving findings rather than a pass or fail, such as a code review or
  an API review.
- **vet** — a trust verdict on something from a third party before it is installed, such as `skill vet`.
- **verify** — run every check and test together, as CI does, such as `pnpm verify`.
- **test** — run tests with a test runner. Evals are one kind of test: `skill test` runs a skill's evals.
- **doctor** — a read-only examination of a setup as it is installed and configured here. It reports what is wrong
  and what the user can do, and changes nothing. A repair goes to the command or skill that owns it. The verb is
  general, not tied to references: Claude Code's `/doctor`, `doctor-buddy-agent-harness`, and `skill doctor` all fit
  it.
- **advise** — suggestions for an author to judge, never a pass or fail, such as `reference advise`.
- **audit** — reserved for security. A sweep that is not about security takes another verb.
- **compare** — put results side by side.
- **report** — publish results.

### Verbs that change something to repair or improve it

- **fix** — make a failed check or test pass.
- **repair** — restore a broken setup that a doctor found.
- **enhance** — make something that already passes better. `improve` is the same job and is not used in new names.

### Verbs that create or configure

- **init** — adopt a tool in a repository for the first time and write its configuration, such as `init-asana`.
- **setup** — put an outside system into a wanted state, safe to run again, such as `setup-github-repo`.
- **config** — view or change a tool's own configuration afterwards, including the lists of entries it keeps, such as
  `config-asana`. It is short for "configure", as in `git config` and Claude Code's `/config`.
- **scaffold** — generate a skeleton.
- **create** — make one new artifact.
- **add** — add one new artifact to something that exists.

### Verbs that bring something up to date

- **update** — change content in place.
- **upgrade** — move to a newer version.
- **migrate** — move from one format or tool to another.
- **sync** — make derived copies match their source.
- **apply** — bring something to a baseline.
- **align** — reconcile drift.
- **modernize** — a bundle of upgrades and migrations.

### Not a verb for names

- **manage** says nothing about the job, so no new skill or command is named with it. A hub over a tool's
  configuration is `config-<x>`. Any other hub is a router skill named after its object, with the specific verbs as
  its commands, like `/reference` with `create`, `delete`, and `list`. Telling an agent in prose to "manage"
  something, such as the open pull requests, is fine; this rule is about names.
- **validate** is not used; it is `check`.

### Naming a skill that carries a verb

A standalone skill takes the bare verb as its name, such as `enhance`, `repair`, or `compare`. The plugin already
scopes it, as in `/buddy-agent-harness:enhance`.

A verb common across the agentic ecosystem is the exception. Its skill is named `<verb>-<plugin>`, such as
`doctor-buddy-agent-harness`. A verb is common when either holds:

- A harness ships it as a built-in command. Claude Code, Codex, and GitHub Copilot CLI each have `/init` and
  `/review`, all four harnesses have a `config` command, and Claude Code has `/doctor`.
- It names a job that nearly every plugin does for itself. Most plugins have their own `init`, and a plugin with a
  setup to examine has its own `doctor`.

Today that is `init`, `doctor`, `config`, and `review`. To decide, ask: would another plugin or the harness itself
offer this same bare name? If yes, use `<verb>-<plugin>`. If not, keep the bare verb.

For a common verb, `<verb>-<plugin>` holds for three reasons:

1. A bare `doctor` collides across plugins and with the harness's own `/doctor`. In a harness that lists skills
   without their plugin, such as Codex, a user would not know which `doctor` to run.
2. `<plugin>-<verb>` repeats the plugin in the full name: `/buddy-agent-harness:buddy-agent-harness-doctor`.
3. Verb first lets a user type `doctor` and then pick which plugin's doctor to run from the list.

A name that adds an object to the verb, such as `config-model-runners` or `review-api`, is already distinct and keeps
that form. A command behind a router skill takes the bare verb: `/reference check`, `/reference advise`,
`/skill doctor`. The skill's name already scopes it, so it collides with nothing.

Verbs that only one plugin uses, such as `ship`, `publish`, `build`, or `jump`, are that plugin's own and are not
listed here.
