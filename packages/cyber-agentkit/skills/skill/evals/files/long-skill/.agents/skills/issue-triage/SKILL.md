---
name: issue-triage
description: Triage a repository's open issues by labeling each one, or audit the labels already applied. Asked as "triage the new issues", "label these issues", or "are our issue labels right".
argument-hint: "triage | audit"
---

# Issue triage

## Commands

| Command | Use it when |
| --- | --- |
| `triage` | the author wants each unlabeled open issue in `issues.json` given one label |
| `audit` | the author wants the labels already on the issues in `issues.json` checked against the catalog |

## triage

1. Read `issues.json` at the repository root: a list of `{ "number", "title", "body", "labels" }`. If there is none,
   say so and stop.
2. For each issue with no label, pick the one label from the catalog below whose meaning fits the issue, by its title
   and body and the signal column. When two fit, take the one whose signal appears in the body.
3. Write the result to `TRIAGE.md`: one line per issue, `#<number> <label>`, in issue-number order.

## audit

1. Read `issues.json` as `triage` does.
2. For each issue with a label, compare the label's meaning in the catalog below with the issue's title and body.
3. Write `AUDIT.md`: one line per issue whose label does not fit, `#<number> <label> -> <better label>`.

## Legacy mode

The `--legacy` option read `issues.csv` instead of `issues.json`, with one issue per row and the labels in a
semicolon-separated column. It wrote `TRIAGE.txt` instead of `TRIAGE.md`. When an author passes `--legacy`, convert
each row to the JSON shape first, then follow `triage` as written, and write the result to both files.

## Label catalog

| Label | Means | Signal |
| --- | --- | --- |
| `api/bug` | something in the api area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `api/feature` | a request for new behavior in the api area | a "could it", "please add", or "it would be nice" with no error |
| `api/performance` | the api area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `api/question` | someone asks how the api area works, with nothing broken | a "how do I" with no error and no request for change |
| `api/regression` | the api area worked in an earlier version and fails now | a version number that worked and one that does not |
| `api/security` | the api area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `api/docs-gap` | the docs for the api area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `auth/bug` | something in the auth area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `auth/feature` | a request for new behavior in the auth area | a "could it", "please add", or "it would be nice" with no error |
| `auth/performance` | the auth area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `auth/question` | someone asks how the auth area works, with nothing broken | a "how do I" with no error and no request for change |
| `auth/regression` | the auth area worked in an earlier version and fails now | a version number that worked and one that does not |
| `auth/security` | the auth area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `auth/docs-gap` | the docs for the auth area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `billing/bug` | something in the billing area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `billing/feature` | a request for new behavior in the billing area | a "could it", "please add", or "it would be nice" with no error |
| `billing/performance` | the billing area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `billing/question` | someone asks how the billing area works, with nothing broken | a "how do I" with no error and no request for change |
| `billing/regression` | the billing area worked in an earlier version and fails now | a version number that worked and one that does not |
| `billing/security` | the billing area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `billing/docs-gap` | the docs for the billing area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `build/bug` | something in the build area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `build/feature` | a request for new behavior in the build area | a "could it", "please add", or "it would be nice" with no error |
| `build/performance` | the build area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `build/question` | someone asks how the build area works, with nothing broken | a "how do I" with no error and no request for change |
| `build/regression` | the build area worked in an earlier version and fails now | a version number that worked and one that does not |
| `build/security` | the build area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `build/docs-gap` | the docs for the build area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `cli/bug` | something in the cli area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `cli/feature` | a request for new behavior in the cli area | a "could it", "please add", or "it would be nice" with no error |
| `cli/performance` | the cli area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `cli/question` | someone asks how the cli area works, with nothing broken | a "how do I" with no error and no request for change |
| `cli/regression` | the cli area worked in an earlier version and fails now | a version number that worked and one that does not |
| `cli/security` | the cli area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `cli/docs-gap` | the docs for the cli area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `config/bug` | something in the config area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `config/feature` | a request for new behavior in the config area | a "could it", "please add", or "it would be nice" with no error |
| `config/performance` | the config area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `config/question` | someone asks how the config area works, with nothing broken | a "how do I" with no error and no request for change |
| `config/regression` | the config area worked in an earlier version and fails now | a version number that worked and one that does not |
| `config/security` | the config area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `config/docs-gap` | the docs for the config area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `docs/bug` | something in the docs area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `docs/feature` | a request for new behavior in the docs area | a "could it", "please add", or "it would be nice" with no error |
| `docs/performance` | the docs area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `docs/question` | someone asks how the docs area works, with nothing broken | a "how do I" with no error and no request for change |
| `docs/regression` | the docs area worked in an earlier version and fails now | a version number that worked and one that does not |
| `docs/security` | the docs area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `docs/docs-gap` | the docs for the docs area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `editor/bug` | something in the editor area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `editor/feature` | a request for new behavior in the editor area | a "could it", "please add", or "it would be nice" with no error |
| `editor/performance` | the editor area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `editor/question` | someone asks how the editor area works, with nothing broken | a "how do I" with no error and no request for change |
| `editor/regression` | the editor area worked in an earlier version and fails now | a version number that worked and one that does not |
| `editor/security` | the editor area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `editor/docs-gap` | the docs for the editor area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `export/bug` | something in the export area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `export/feature` | a request for new behavior in the export area | a "could it", "please add", or "it would be nice" with no error |
| `export/performance` | the export area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `export/question` | someone asks how the export area works, with nothing broken | a "how do I" with no error and no request for change |
| `export/regression` | the export area worked in an earlier version and fails now | a version number that worked and one that does not |
| `export/security` | the export area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `export/docs-gap` | the docs for the export area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `i18n/bug` | something in the i18n area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `i18n/feature` | a request for new behavior in the i18n area | a "could it", "please add", or "it would be nice" with no error |
| `i18n/performance` | the i18n area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `i18n/question` | someone asks how the i18n area works, with nothing broken | a "how do I" with no error and no request for change |
| `i18n/regression` | the i18n area worked in an earlier version and fails now | a version number that worked and one that does not |
| `i18n/security` | the i18n area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `i18n/docs-gap` | the docs for the i18n area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `import/bug` | something in the import area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `import/feature` | a request for new behavior in the import area | a "could it", "please add", or "it would be nice" with no error |
| `import/performance` | the import area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `import/question` | someone asks how the import area works, with nothing broken | a "how do I" with no error and no request for change |
| `import/regression` | the import area worked in an earlier version and fails now | a version number that worked and one that does not |
| `import/security` | the import area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `import/docs-gap` | the docs for the import area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `install/bug` | something in the install area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `install/feature` | a request for new behavior in the install area | a "could it", "please add", or "it would be nice" with no error |
| `install/performance` | the install area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `install/question` | someone asks how the install area works, with nothing broken | a "how do I" with no error and no request for change |
| `install/regression` | the install area worked in an earlier version and fails now | a version number that worked and one that does not |
| `install/security` | the install area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `install/docs-gap` | the docs for the install area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `logging/bug` | something in the logging area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `logging/feature` | a request for new behavior in the logging area | a "could it", "please add", or "it would be nice" with no error |
| `logging/performance` | the logging area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `logging/question` | someone asks how the logging area works, with nothing broken | a "how do I" with no error and no request for change |
| `logging/regression` | the logging area worked in an earlier version and fails now | a version number that worked and one that does not |
| `logging/security` | the logging area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `logging/docs-gap` | the docs for the logging area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `network/bug` | something in the network area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `network/feature` | a request for new behavior in the network area | a "could it", "please add", or "it would be nice" with no error |
| `network/performance` | the network area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `network/question` | someone asks how the network area works, with nothing broken | a "how do I" with no error and no request for change |
| `network/regression` | the network area worked in an earlier version and fails now | a version number that worked and one that does not |
| `network/security` | the network area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `network/docs-gap` | the docs for the network area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `notifications/bug` | something in the notifications area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `notifications/feature` | a request for new behavior in the notifications area | a "could it", "please add", or "it would be nice" with no error |
| `notifications/performance` | the notifications area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `notifications/question` | someone asks how the notifications area works, with nothing broken | a "how do I" with no error and no request for change |
| `notifications/regression` | the notifications area worked in an earlier version and fails now | a version number that worked and one that does not |
| `notifications/security` | the notifications area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `notifications/docs-gap` | the docs for the notifications area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `parser/bug` | something in the parser area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `parser/feature` | a request for new behavior in the parser area | a "could it", "please add", or "it would be nice" with no error |
| `parser/performance` | the parser area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `parser/question` | someone asks how the parser area works, with nothing broken | a "how do I" with no error and no request for change |
| `parser/regression` | the parser area worked in an earlier version and fails now | a version number that worked and one that does not |
| `parser/security` | the parser area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `parser/docs-gap` | the docs for the parser area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `plugins/bug` | something in the plugins area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `plugins/feature` | a request for new behavior in the plugins area | a "could it", "please add", or "it would be nice" with no error |
| `plugins/performance` | the plugins area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `plugins/question` | someone asks how the plugins area works, with nothing broken | a "how do I" with no error and no request for change |
| `plugins/regression` | the plugins area worked in an earlier version and fails now | a version number that worked and one that does not |
| `plugins/security` | the plugins area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `plugins/docs-gap` | the docs for the plugins area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `search/bug` | something in the search area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `search/feature` | a request for new behavior in the search area | a "could it", "please add", or "it would be nice" with no error |
| `search/performance` | the search area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `search/question` | someone asks how the search area works, with nothing broken | a "how do I" with no error and no request for change |
| `search/regression` | the search area worked in an earlier version and fails now | a version number that worked and one that does not |
| `search/security` | the search area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `search/docs-gap` | the docs for the search area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `storage/bug` | something in the storage area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `storage/feature` | a request for new behavior in the storage area | a "could it", "please add", or "it would be nice" with no error |
| `storage/performance` | the storage area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `storage/question` | someone asks how the storage area works, with nothing broken | a "how do I" with no error and no request for change |
| `storage/regression` | the storage area worked in an earlier version and fails now | a version number that worked and one that does not |
| `storage/security` | the storage area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `storage/docs-gap` | the docs for the storage area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `sync/bug` | something in the sync area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `sync/feature` | a request for new behavior in the sync area | a "could it", "please add", or "it would be nice" with no error |
| `sync/performance` | the sync area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `sync/question` | someone asks how the sync area works, with nothing broken | a "how do I" with no error and no request for change |
| `sync/regression` | the sync area worked in an earlier version and fails now | a version number that worked and one that does not |
| `sync/security` | the sync area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `sync/docs-gap` | the docs for the sync area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `telemetry/bug` | something in the telemetry area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `telemetry/feature` | a request for new behavior in the telemetry area | a "could it", "please add", or "it would be nice" with no error |
| `telemetry/performance` | the telemetry area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `telemetry/question` | someone asks how the telemetry area works, with nothing broken | a "how do I" with no error and no request for change |
| `telemetry/regression` | the telemetry area worked in an earlier version and fails now | a version number that worked and one that does not |
| `telemetry/security` | the telemetry area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `telemetry/docs-gap` | the docs for the telemetry area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `ui/bug` | something in the ui area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `ui/feature` | a request for new behavior in the ui area | a "could it", "please add", or "it would be nice" with no error |
| `ui/performance` | the ui area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `ui/question` | someone asks how the ui area works, with nothing broken | a "how do I" with no error and no request for change |
| `ui/regression` | the ui area worked in an earlier version and fails now | a version number that worked and one that does not |
| `ui/security` | the ui area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `ui/docs-gap` | the docs for the ui area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `upgrade/bug` | something in the upgrade area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `upgrade/feature` | a request for new behavior in the upgrade area | a "could it", "please add", or "it would be nice" with no error |
| `upgrade/performance` | the upgrade area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `upgrade/question` | someone asks how the upgrade area works, with nothing broken | a "how do I" with no error and no request for change |
| `upgrade/regression` | the upgrade area worked in an earlier version and fails now | a version number that worked and one that does not |
| `upgrade/security` | the upgrade area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `upgrade/docs-gap` | the docs for the upgrade area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `webhooks/bug` | something in the webhooks area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `webhooks/feature` | a request for new behavior in the webhooks area | a "could it", "please add", or "it would be nice" with no error |
| `webhooks/performance` | the webhooks area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `webhooks/question` | someone asks how the webhooks area works, with nothing broken | a "how do I" with no error and no request for change |
| `webhooks/regression` | the webhooks area worked in an earlier version and fails now | a version number that worked and one that does not |
| `webhooks/security` | the webhooks area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `webhooks/docs-gap` | the docs for the webhooks area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |
| `workers/bug` | something in the workers area does not work as documented | a stack trace, an error message, or steps that end in the wrong result |
| `workers/feature` | a request for new behavior in the workers area | a "could it", "please add", or "it would be nice" with no error |
| `workers/performance` | the workers area is slower or uses more memory than it should | a timing, a profile, or "takes minutes" |
| `workers/question` | someone asks how the workers area works, with nothing broken | a "how do I" with no error and no request for change |
| `workers/regression` | the workers area worked in an earlier version and fails now | a version number that worked and one that does not |
| `workers/security` | the workers area exposes data or accepts input it should not | a token, a password, an injection, or a permission |
| `workers/docs-gap` | the docs for the workers area are missing, wrong, or out of date | a link to a docs page, or "the docs say" |

## Done when

Before reporting done, check each of these against the result. Report any that fails.

- **C1.** After `triage`, every open issue that had no label appears exactly once in `TRIAGE.md`, with one label from
  the catalog.
- **C2.** After `audit`, `AUDIT.md` names each issue whose label does not fit, and only those.
