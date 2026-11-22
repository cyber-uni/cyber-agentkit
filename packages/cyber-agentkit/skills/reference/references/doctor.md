# Examine the system a capability reference describes

The doctor runs a capability reference's Detect on this machine and reports where the system found here disagrees with what the reference says. It changes no file. An author runs it against their own system before updating Verified; a user runs it after a step failed, to learn whether their system or the reference is wrong.

## 1. Check the name

1. The name must be `<system>.capabilities`, with `<system>` one segment and no dot, a `<plugin>/` prefix aside. Any other name is an error: say it is not a capability reference, run nothing, and stop.
2. Run `load <name> --trace`. When the name is not `found`, report its status and message, run nothing, and stop.
3. Run `check <name>`. When it fails a `capability` check, report it, run nothing, and stop: without System, Detect, and Verified in order there is nothing to run.

From the trace, note the `used` layers: the file that answered, its tier, and, for a plugin tier, the plugin's name and folder. A repo or user layer means a local patch changed what the plugin says; the report names it. The plugin's **repository** is the `repository` its manifest names: read it from `.claude-plugin/plugin.json` in the plugin's folder, else `plugin.json`, else `package.json`, as a URL or as `repository.url`. A plugin whose manifest names none has no repository to report to.

## 2. Read what to run

From the document `load` printed, take:

- **System**: the versions or tiers covered, and the tools needed with their minimum versions.
- **Detect**: how to tell this system is the one in use, and how to learn its version or tier.
- **Verified**: each entry, one per version or tier.
- **Features**: every `##` section after Verified, with its `**Partial.**` or `**Unsupported.**` mark and sentence, and its `Since:` and `Until:` lines.

The commands Detect names are the reference author's, not this skill's. Before running any, show the user each command and the file it came from. Run only commands that read: a version query, a status, a listing, an API `GET`. Never run one that creates, changes, or deletes anything, here or on the system, and never one that sends a secret anywhere Detect does not name; list it as not run, with why. To learn a tool's version when Detect does not say, run the tool's own version flag, such as `glab --version`.

## 3. Run Detect

Run the commands, and read what they print against what Detect says it means.

- When a needed tool is missing, or Detect finds this is not the system, the report says so and why, and compares no feature. Go to step 5.
- Otherwise note the version and the tier found, and how each was found. When Detect cannot tell one of them, say it was not found.

## 4. Compare

For each feature with a `Since:` or `Until:` line, decide whether what was found falls inside it: at or after `Since`, and before `Until`. Compare a tier by the order System lists the tiers in; when System gives no order, say the tier could not be compared. A feature disagrees when:

- what was found falls outside its lines, and the section is not marked `**Unsupported.**`: the reference says a skill can use it, and this system lacks it;
- what was found falls inside its lines, and the section is marked `**Unsupported.**` or `**Partial.**`: quote the mark's sentence, since a local patch may say why.

A feature with no version line is not compared; count it, without listing it.

Then find the Verified entry that covers the version and tier found. When none does, the reference is unverified for this system.

## 5. Report

Write the report so the user can send it to the reference's author as it stands: no home-folder path, host name, token, or account name from what the commands printed. Give:

1. The capability reference's name, and the tier and plugin that answered it; when a repo or user layer applies, say a local patch is in use.
2. The version and tier found, and how; or that the system was not detected, or which tool is missing.
3. Each feature that disagrees, with its lines, its mark, and what was found; or that none does, and how many features carry no version line.
4. The Verified entry that covers what was found, or that none does.
5. Each command Detect named that was not run, and why.

Then offer what to do next, each as one line:

- **Author:** update Verified with what this run found, and fix each feature that disagrees.
- **User:** patch the capability reference for this repository with [Customize](customize.md), marking what this system lacks, as a stopgap; and report to the author, with this report as the body, at the plugin's repository, or, when it has none, to the plugin's author with no link.

Change nothing yourself. Customize and the report to the author each run only on the user's yes.
