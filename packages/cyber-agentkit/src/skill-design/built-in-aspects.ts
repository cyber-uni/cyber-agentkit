import type { AspectCheck } from './skill-check-types.js'
import { specChecks } from './spec-checks.js'

/**
 * The aspects written into `/skill` itself, with the checks its `SKILL.md` lists for them. A test keeps
 * the two in step. The specification floor comes first: every other aspect is still checked when it fails.
 */
export const builtInAspects: { aspect: string; checks: AspectCheck[] }[] = [
	{
		aspect: 'specification',
		checks: specChecks.map(({ id, statement }) => ({ id, how: 'script', statement })),
	},
	{
		aspect: 'intent',
		checks: [
			{
				id: 'INT-1',
				how: 'read',
				statement: 'The opening paragraph of `README.md` names one job and the result the skill hands back.',
			},
			{ id: 'INT-2', how: 'read', statement: 'It names the nearest job the skill does not do, where one exists.' },
			{ id: 'INT-3', how: 'read', statement: 'Nothing in the body works on a job the Intent does not name.' },
		],
	},
	{
		aspect: 'shape',
		checks: [
			{ id: 'SHP-1', how: 'script', statement: 'The `SKILL.md` body is at most 500 lines.' },
			{
				id: 'SHP-2',
				how: 'script',
				statement:
					'Every file the body links exists, and every file under `references/` is linked from the body or from a file it links, except a reference default (`<name>.default.md`), which is loaded by name.',
			},
			{
				id: 'SHP-3',
				how: 'read',
				statement: 'A step that a program could do the same way every time is a script, not prose.',
			},
			{
				id: 'SHP-4',
				how: 'read',
				statement: 'Each file under `references/` is read only on some paths; text every run needs is in `SKILL.md`.',
			},
		],
	},
	{
		aspect: 'trigger',
		checks: [
			{
				id: 'TRG-1',
				how: 'read',
				statement: 'The description says when to use the skill, in words a user would type.',
			},
			{ id: 'TRG-3', how: 'read', statement: 'It describes when to use the skill, not how the skill works.' },
			{ id: 'TRG-4', how: 'run', statement: 'The skill fires on the requests it should and not on near misses.' },
		],
	},
]
