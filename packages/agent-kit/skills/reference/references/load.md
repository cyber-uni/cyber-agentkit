# Load references for a caller

Load the references a calling skill names, and hand them back as part of its instructions. The **caller** is the skill whose instructions sent you here; its **folder** is the directory its `SKILL.md` is in.

When the caller names an interface ("Load the implementations of the `<id>` interface"), follow [Implementations of an interface](#implementations-of-an-interface) for it. Load any names it also lists with steps 1 to 4.

## 1. Run the command once

Find the caller's folder from what the harness told you when the caller loaded: a `Base directory for this skill: <folder>` line, or the path of its `SKILL.md`, whose folder is the caller's. Then collect every name the caller listed, in its order, and run one command for all of them, from anywhere:

```sh
node <this skill's folder>/scripts/reference.mjs show <name>... --default <caller folder> --root <repository root>
```

- `<this skill's folder>` is the directory the `reference` skill's `SKILL.md` is in.
- `--default <caller folder>` adds the caller's own defaults, `references/<name>.default.md` in its folder, below every other contribution.
- When you cannot tell the caller's folder, leave out `--default`. The names then resolve without the caller's defaults; say so in step 4.
- `<repository root>` is the root of the repository you are working in, so its `.agents/references/` customizations apply. Pass it even when it is the working directory.
- Never use `npx`, `pnpm dlx`, `upx`, or any other package runner, and never download anything, not even when this command cannot run. Go to step 3 instead.

Do not read `.agents/references/`, `~/.agents/`, any plugin's `references/`, or the caller's `references/` yourself. What answers a name is the command's decision.

## 2. Read what it printed

One name prints its document. Several print each as `<reference name="…">` … `</reference>`, in the order asked. A name that did not resolve prints `<reference name="…" status="…" />` in its place, and an `error: <code>: <message>` line on stderr names it. Exit 0 means every name resolved; 1 means at least one did not.

**The command ran** when every name you asked for appears in the output as a document or a `status=` marker; for a single name, exit 0 with a document on stdout, or exit 1 with an `error:` line naming it, also counts. Anything else (`Cannot find module`, `node: not found`, a stack trace, no mention of the names) means it did not run: go to step 3.

Per name:

- **found**: use the document.
- **missing** (`reference-missing`): carry on without it, and tell the user it was not loaded. Do not read the caller's default or search for a substitute: the command already included the default. When the error says a `remove` turned the name off, say nothing about it.
- **ambiguous** (`reference-ambiguous`): more than one plugin holds the name and nothing says which to build on. The error lists the options: each `<plugin>/<name>`, and `default` when the caller has one.
  - With a user present, list every option, even when only one is left, and ask which the name should build on. Write the pick with `reference select <name> <option>` (add `--scope user` when the user wants it for themselves only), then run step 1 again for that name alone and use what it prints.
  - With no user present, carry on without it, and tell the user to settle it with `reference select <name> <option>`.
- **invalid** (`reference-invalid`): the caller's load line names something that is not a reference name. Never read the path or file it names. Carry on without it, and tell the user it is a fault in the caller's instructions, to report to the caller's author.

A `warning:` line does not change the answer. Pass one on only when it names `reference select`; it means a plugin answers over the caller's default, and the user can choose.

## 3. When the command did not run

Read the caller's default of **every** name: `<caller folder>/references/<name>.default.md`. A name with no such file is **not loaded**. Never read `<caller folder>/references/<name>.md`; it is not a default.

## 4. Report, then continue the caller's work

Tell the user, briefly, about every name that did not come from the command, and every name not loaded:

- a name not loaded, and why: missing, ambiguous (with the options), or invalid (a fault for the caller's author);
- when the command did not run: that it did not, the error it gave, and that each name came from the caller's default, so no project, user, or machine customization applied;
- when the command did not run and a name has no default: that `scripts/reference.mjs` ships with the npm package, so a `uni-agent-kit` plugin installed from git has none, and installing it from npm fixes it;
- when you could not tell the caller's folder: that the names were loaded without its defaults.

Say nothing about the load when every name came from the command, and nothing about a name a `remove` turned off.

Then return to the caller. Follow each loaded document as part of the caller's instructions. Carry on without a name that was not loaded.

## Implementations of an interface

1. Run, from anywhere:

   ```sh
   node <this skill's folder>/scripts/reference.mjs implementations <id> --trace --format json --root <repository root>
   ```

   Add `--accept <versions>`, such as `--accept 1,2`, when the caller names the interface versions it knows. The same rules as step 1 apply: no package runner, no download, and no reading tier folders yourself.
2. Exit 0 prints one JSON object. `implementations` lists each one the caller can load, with its `pin`, `description`, and the `unsupported` sections it does not honor; it is a string when there are none. `excluded` lists each one left out, with its `reasons`. Exit 1 prints an `error:` line on stderr, such as `no interface document <id>.interface`; then the interface is **not loaded**.
3. Hand the list to the caller. The caller picks the implementations it needs; load each by its `pin` with steps 1 to 4.
4. Tell the user, briefly, about each excluded implementation and its reasons, and about an interface not loaded and its error. The caller carries on without the implementations.

## Validate

Before returning to the caller:

- Every name the caller listed is either loaded from the command, read from the caller's default because the command did not run, or named in the report as not loaded.
- The caller's default was read only when the command did not run, never for a name the command reported.
- An ambiguous name was settled with `reference select` only after the user picked an option.
- Every interface the caller named is either listed with `implementations`, or named in the report as not loaded.
- No `npx`, `pnpm dlx`, `upx`, or download was run.
- No file under a tier folder, and no path an invalid name gives, was read by you.
- The report is empty when every name came from the command.
