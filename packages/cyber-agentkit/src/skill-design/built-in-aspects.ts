import type { AspectCheck } from './skill-check-types.js'
import { specChecks } from './spec-checks.js'

/** A built-in check, and the kind of skill it applies to when not every skill (`name-only`, or `matched`: not name-only). */
export type BuiltInCheck = AspectCheck & { appliesTo?: 'name-only' | 'matched' }

/**
 * The aspects written into `/skill` itself, with the checks its `SKILL.md` lists for them. A test keeps
 * the two in step. The specification floor comes first: every other aspect is still checked when it fails.
 */
export const builtInAspects: { aspect: string; checks: BuiltInCheck[] }[] = [
	{
		aspect: 'specification',
		checks: specChecks.map(({ id, statement }) => ({ id, how: 'script', severity: 'critical', statement })),
	},
	{
		aspect: 'intent',
		checks: [
			{
				id: 'INT-1',
				how: 'read',
				severity: 'warning',
				statement: 'The opening paragraph of `README.md` names one job and the result the skill hands back.',
			},
			{
				id: 'INT-3',
				how: 'read',
				severity: 'warning',
				statement:
					'Nothing in the body works on a job the Intent does not name, says again what another part of the skill already says, or composes a skill, reference, or command that no longer exists or no longer does what the body expects.',
			},
		],
	},
	{
		aspect: 'shape',
		checks: [
			{
				id: 'SHP-1',
				how: 'script',
				severity: 'warning',
				statement: 'The `SKILL.md` body is at most 500 lines and about 5,000 tokens, at four characters a token.',
			},
			{
				id: 'SHP-2',
				how: 'script',
				severity: 'critical',
				statement:
					'Every file the body links, or names as a plain-text path under `scripts/`, `references/`, or another of its folders, exists; every `#anchor` it links matches a heading; and every file under `references/` is linked from the body or from a file it links, except a reference default (`<name>.default.md`), which is loaded by name.',
			},
			{
				id: 'SHP-3',
				how: 'read',
				severity: 'warning',
				statement:
					'A step that applies fixed rules to data (filtering, sorting, grouping, counting, or formatting) is a script, not prose, however few its rules. Judgment, such as choosing what to say, stays prose.',
			},
			{
				id: 'SHP-4',
				how: 'read',
				severity: 'warning',
				statement:
					'Each file under `references/` is read only on some paths, and the step that loads it says when; text every run needs is in `SKILL.md`, and large reference material (long tables, examples, or catalogs) is under `references/`.',
			},
			{
				id: 'SHP-5',
				how: 'read',
				severity: 'warning',
				statement:
					'A choice only one team would make (a host, tool, workflow, template, policy, or path) is a reference the skill loads, not text in the skill, unless the skill cannot work without it.',
			},
			{
				id: 'SHP-6',
				how: 'read',
				severity: 'warning',
				statement:
					'Each reference the skill loads ships a default, or the skill names the plugin that supplies it and says what it does when the name is missing.',
			},
			{
				id: 'SHP-7',
				how: 'script',
				severity: 'critical',
				statement: '`SKILL.md` sits in its own folder, directly under a skill root: a folder named `skills`.',
			},
			{
				id: 'SHP-8',
				how: 'script',
				severity: 'critical',
				statement:
					'A skill that ships to others (its `skills` root is not inside a dot-folder such as `.agents/`) links and names no file outside its folder: no `../` path that leaves it, and no repository path such as `docs/` or `src/`.',
			},
			{
				id: 'SHP-9',
				how: 'script',
				severity: 'critical',
				statement:
					'`skill.json`, when present, is a JSON object, and its `distribution`, when present, sets `install_via` to `package_manager` with a `package.name`.',
			},
			{
				id: 'SHP-10',
				how: 'script',
				severity: 'warning',
				statement:
					'The skill folder holds no folder but `scripts/`, `references/`, `assets/`, `evals/`, and `agents/`, and `agents/` holds YAML files only.',
			},
			{
				id: 'SHP-11',
				how: 'script',
				severity: 'warning',
				statement:
					'Static resources (images, data files, templates) are in `assets/`, and the root of the skill folder holds no Markdown file but `SKILL.md` and `README.md`.',
			},
			{
				id: 'SHP-12',
				how: 'script',
				severity: 'warning',
				statement: 'The body gives the agent steps to follow: numbered steps or `##` sections.',
			},
			{
				id: 'SHP-13',
				how: 'script',
				severity: 'warning',
				statement:
					"When the skill bundles scripts, no Markdown the agent reads tells it to parse a script's output; a script prints what the agent needs, or JSON.",
			},
			{
				id: 'SHP-14',
				how: 'script',
				severity: 'warning',
				statement: "A script that prompts the user takes a `--yes` flag, and the skill's Markdown documents it.",
			},
			{
				id: 'SHP-15',
				how: 'read',
				severity: 'warning',
				statement:
					'The body gives no instruction the model would follow without it, such as "be thorough" or "write clean code", and does not open with a paragraph that repeats the description.',
			},
			{
				id: 'SHP-16',
				how: 'read',
				severity: 'warning',
				statement: 'The body has no `## Why`, `## Rationale`, or `## Next Steps` section.',
			},
			{
				id: 'SHP-17',
				how: 'read',
				severity: 'warning',
				statement:
					'Where a step could be done more than one way, it names one default and when to leave it, not a menu of options to choose from.',
			},
			{
				id: 'SHP-18',
				how: 'read',
				severity: 'warning',
				statement:
					'Each script or command the body runs writes machine output to stdout, in the format the body asks for, and prints prose only behind `--verbose`.',
			},
		],
	},
	{
		aspect: 'trigger',
		checks: [
			{
				id: 'TRG-1',
				how: 'read',
				severity: 'critical',
				statement: 'The description says when to use the skill, in words a user would type.',
				appliesTo: 'matched',
			},
			{
				id: 'TRG-3',
				how: 'read',
				severity: 'warning',
				statement: 'It describes when to use the skill, not how the skill works.',
			},
			{
				id: 'TRG-4',
				how: 'run',
				severity: 'critical',
				statement: 'The skill fires on the requests it should and not on near misses.',
				appliesTo: 'matched',
			},
			{
				id: 'TRG-5',
				how: 'script',
				severity: 'critical',
				statement:
					'A name-only skill\'s description is exactly `By name only`, or `Partial Skill: ` followed by text with no trigger phrase, such as "use when" or "when to use".',
				appliesTo: 'name-only',
			},
			{
				id: 'TRG-6',
				how: 'read',
				severity: 'warning',
				statement:
					"A name-only skill's description carries no operational detail (what it does, who calls it, or how it works) and no trigger language.",
				appliesTo: 'name-only',
			},
			{
				id: 'TRG-7',
				how: 'script',
				severity: 'warning',
				statement:
					'The description is at least 12 words, and uses no phrase that fits any skill, such as "helps with" or "various tasks".',
				appliesTo: 'matched',
			},
			{
				id: 'TRG-8',
				how: 'read',
				severity: 'warning',
				statement: 'It matches the body: each command, file, or skill it names exists and does what it says.',
			},
		],
	},
]
