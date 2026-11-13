import { isNameOnly, nameOnlyFormProblem } from './name-only-skills.js'
import type { CheckOutcome } from './skill-check-types.js'
import type { SkillFiles } from './skill-files.js'

/** TRG-5, the Trigger aspect's script check: a name-only skill's description takes the allowed form. */
export function checkTrigger(skill: SkillFiles): CheckOutcome[] {
	if (!isNameOnly(skill)) return [{ id: 'TRG-5', status: 'skipped', message: 'the skill is not name-only' }]
	const problem = nameOnlyFormProblem(skill)
	return [
		problem ? { id: 'TRG-5', status: 'fail', message: problem, file: 'SKILL.md' } : { id: 'TRG-5', status: 'pass' },
	]
}
