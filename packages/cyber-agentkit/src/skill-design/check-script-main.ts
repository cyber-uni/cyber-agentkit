import type { CheckOutcome } from './skill-check-types.js'
import { readSkill, type SkillFiles } from './skill-files.js'

/**
 * The body of an aspect's check script: `node <script> <skill folder>` prints
 * `{"checks": [...]}` and exits 0 whatever it found; `skill check` decides the exit code.
 */
export function checkScriptMain(check: (skill: SkillFiles) => CheckOutcome[], argv = process.argv): number {
	const folder = argv[2]
	const skill = folder === undefined ? undefined : readSkill(folder)
	if (!skill) {
		process.stderr.write(`error: no SKILL.md in ${folder ?? '(no folder given)'}\n`)
		return 1
	}
	process.stdout.write(`${JSON.stringify({ checks: check(skill) })}\n`)
	return 0
}
