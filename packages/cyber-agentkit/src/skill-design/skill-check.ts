import { builtInAspects } from './built-in-aspects.js'
import { type AspectToCheck, mergeChecks, type SkillCheckReport } from './check-skill.js'
import { checkLayout } from './layout-checks.js'
import { isNameOnly } from './name-only-skills.js'
import type { ScriptRun } from './run-check-script.js'
import { checkShape } from './shape-checks.js'
import type { LoadedAspect } from './skill-aspects.js'
import type { SkillFiles } from './skill-files.js'
import { checkSpec } from './spec-checks.js'
import { checkTrigger } from './trigger-checks.js'

const builtInCode: Record<string, (skill: SkillFiles) => AspectToCheck['reported']> = {
	specification: checkSpec,
	shape: (skill) => [...checkShape(skill), ...checkLayout(skill)],
	trigger: checkTrigger,
}

/** Checks a skill against the built-in aspects and every swappable one, running each one's check script. */
export function checkSkill(
	skill: SkillFiles,
	swappable: LoadedAspect[],
	run: (script: string, folder: string) => ScriptRun,
): SkillCheckReport {
	const kind = isNameOnly(skill) ? 'name-only' : 'matched'
	const aspects: AspectToCheck[] = builtInAspects.map(({ aspect, checks }) => {
		const skipped = Object.fromEntries(
			checks
				.filter(({ appliesTo }) => appliesTo !== undefined && appliesTo !== kind)
				.map(({ id }) => [id, kind === 'name-only' ? 'the skill is name-only' : 'the skill is not name-only']),
		)
		return {
			aspect,
			implementation: 'built in',
			checks: checks.map(({ appliesTo: _, ...check }) => check),
			reported: builtInCode[aspect]?.(skill),
			...(Object.keys(skipped).length ? { skipped } : {}),
		}
	})
	for (const loaded of swappable) {
		const entry: AspectToCheck = {
			aspect: loaded.aspect,
			implementation: loaded.implementation,
			checks: loaded.checks,
			reported: undefined,
		}
		if (loaded.problem) {
			entry.problem = loaded.problem
			entry.broken = true
		} else if (loaded.checkScript) {
			const ran = run(loaded.checkScript, skill.folder)
			if ('outcomes' in ran) entry.reported = ran.outcomes
			else {
				entry.problem = ran.problem
				entry.broken = ran.broken
			}
		}
		aspects.push(entry)
	}
	const name =
		typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
	return mergeChecks(name, aspects)
}
