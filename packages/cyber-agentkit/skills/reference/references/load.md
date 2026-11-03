# Load references for a caller

Load the references a calling skill names, and hand them back as part of its instructions. The **caller** is the skill whose instructions sent you here; its **folder** is the directory its `SKILL.md` is in.

When the caller names an interface ("Load the implementations of the `<id>` interface"), follow [Implementations of an interface](#implementations-of-an-interface) for it. Load any names it also lists with steps 1 to 6.

## 1. Run the command once

Find the caller's folder from what the harness told you when the caller loaded: a `Base directory for this skill: <folder>` line, or the path of its `SKILL.md`. Collect every name the caller listed, in its order, and run one command for all of them:

```sh
node <this skill's folder>/scripts/reference.mjs load <name>... --default <caller folder>
```

- `<this skill's folder>` is the directory the `reference` skill's `SKILL.md` is in.
- `--default <caller folder>` adds the caller's own defaults below every other contribution.
- Add `--root <repository root>` only when the working folder is not in the repository you work in.
- When you cannot tell the caller's folder, leave out `--default`. The names then load without the caller's defaults. Tell the user so in step 5.
- Never use `npx`, `pnpm dlx`, `upx`, or any other package runner, and never download anything, not even when this command cannot run. Go to step 4 instead.

Do not read `.agents/references/`, `~/.agents/`, any plugin's `references/`, or the caller's `references/` yourself. What answers a name is the command's decision.

## 2. Read the result

The result is on stdout. One found name prints its document. Several print each as `<reference name="…">` … `</reference>`, in the order asked. A name that was not found prints `<reference name="…" status="…" code="…">message</reference>` in its place, also when it is the only name. Read the status and the code from that tag. The command exits 0 even when a name was not found.

A found document may end with project sections, each wrapped as `<project folder="…">` … `</project>`. Each one states what differs for work in that folder.

A warning prints on stderr as `warning: <code>: <message>`. It does not change the answer.

**The command ran** when every name you asked for appears on stdout as a document or a status tag. Exit 1 or 2 with one error value on stdout (`error:` and `code:` lines) means it ran but could not answer: go to step 4 and report the error. Anything else (`Cannot find module`, `node: not found`, a stack trace, no mention of the names) means it did not run: go to step 4.

## 3. Act on each name

- **found**: use the document.
- **missing** with `reference-missing`: carry on without it, and tell the user it was not loaded. Do not read the caller's default or search for a substitute: the command already included the default.
- **missing** with `reference-removed`: a `remove` turned the name off on purpose. Carry on without it, and say nothing about it. It is not a fault.
- **ambiguous** with `reference-ambiguous`: more than one plugin holds the name and nothing says which to build on. The tag ends with `; options: …`: each `<plugin>/<name>`, and `default` when the caller has one.
  - With a user present, list every option, including `default`, even when only one is left. Ask which the name should build on, and whether the pick is for the repository (the default) or only for them. Write the pick with `reference customize <name> --extends <step>`, where the step is the option's plugin part or `default`, adding `--default <caller folder>`, and `--scope user` when it is for them only. Then run step 1 again for that name alone and use what it prints.
  - With no user present, carry on without it, and tell the user to settle it with Customize mode.
- **invalid** with `reference-invalid`: the caller's load line names something that is not a reference name. Never read the path or file it names. Carry on without it, and tell the user it is a fault in the caller's instructions, to report to the caller's author.

Pass every warning on to the user, one line each, and use the reference as loaded. A `reference-stale` warning means a generated document was built against plugins that have since changed: name the changed plugins from its message, and say that Customize mode revises the document from its recorded request.

## 4. When the command did not run

Read the caller's default of every name, and only then. Never read a default for a name the command reported, whatever its status. A name's default is the first of these in the caller's folder:

1. `references/<name>.default.md`
2. `references/<name>.default.json`, `.default.yaml`, `.default.yml`, `.default.toml`, then `.default.txt`

A name with no such file is not loaded. Never read `references/<name>.md`; it is not a default.

## 5. Report

Tell the user, briefly:

- each name not loaded, and why: missing, ambiguous (with the options), or invalid (a fault for the caller's author). Leave out a name a `remove` turned off.
- each warning, one line each.
- when the command did not run: that it did not, the error it gave, and that each name came from the caller's default, so no managed text, project section, or repository or user customization applied. When a name has no default, add that `scripts/reference.mjs` ships with the npm package, so a `cyber-agentkit` plugin installed from git has none, and installing it from npm fixes it.
- when you could not tell the caller's folder: that the names loaded without its defaults.

Say nothing about the load when every name was found with no warning.

## 6. Follow the references

Return to the caller. Follow each loaded document as part of its instructions. Carry on without a name that was not loaded.

Where instructions conflict, follow them in this order, highest first:

1. company and team instructions the harness gives you;
2. a single feature's own document the caller points you at;
3. the resolved reference, or the default read when the command did not run.

Within a resolved reference, the project section for the folder the work is in ranks over the main document. When sections of nested folders both apply, follow both, and the inner folder's section wins where they conflict. Managed text needs no ranking: the command already applied it.

Follow a project section whenever your work is in its folder. When the work moves into a folder partway through the task, follow that folder's project section from then on, without loading again. Stop following it when the work leaves the folder.

## Implementations of an interface

1. Run:

   ```sh
   node <this skill's folder>/scripts/reference.mjs implementations <id> --trace --format json
   ```

   Add `--accept <versions>`, such as `--accept 1,2`, when the caller names the interface versions it knows. The rules of step 1 apply: add `--root` only outside the repository, no package runner, no download, and no reading tier folders yourself.
2. Exit 0 prints one JSON object. `implementations` lists each one the caller can load, with its `pin`, `description`, and the `unsupported` sections it does not honor. It is empty when there are none. `excluded` lists each one left out, with its `reasons`. An unknown interface exits 1 with one error value on stdout, code `interface-unknown`; then the interface is not loaded.
3. Hand the list to the caller. The caller picks the implementations it needs; load each by its `pin` with steps 1 to 6.
4. Tell the user, briefly, about each excluded implementation and its reasons, and about an interface not loaded and its error.

## Validate

Before returning to the caller:

- Every name the caller listed is loaded from the command, read from the caller's default because the command did not run, or named in the report as not loaded.
- The caller's default was read only when the command did not run, never for a name the command reported.
- An ambiguous name was written with `reference customize --extends` only after the user picked an option and a scope.
- Every warning was passed on, one line each.
- No `npx`, `pnpm dlx`, `upx`, or download was run.
- No file under a tier folder, and no path an invalid name gives, was read by you.
