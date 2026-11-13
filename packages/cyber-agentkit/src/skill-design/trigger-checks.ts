import { isNameOnly, nameOnlyFormProblem } from './name-only-skills.js'
import type { CheckOutcome } from './skill-check-types.js'
import type { SkillFiles } from './skill-files.js'

/** The fewest words a description can have and still name a job and how users ask for it. */
export const minDescriptionWords = 12

/** Phrases that fit any skill, so they tell the model nothing about when to pick this one. */
const genericPhrases = [
	'helps with',
	'various tasks',
	'general purpose',
	'general-purpose',
	'handles tasks',
	'does things',
	'anything related to',
]

/** TRG-7: a matched skill's description is specific, long enough and free of phrases that fit any skill. */
function checkSpecific(skill: SkillFiles): CheckOutcome {
	const description = skill.frontmatter?.['description']
	if (typeof description !== 'string' || !description.trim())
		return { id: 'TRG-7', status: 'not-checked', message: 'there is no `description` to read (see SPEC-3)' }
	const problems: string[] = []
	const words = description.split(/\s+/).filter(Boolean).length
	if (words < minDescriptionWords) problems.push(`the description is ${words} words, under ${minDescriptionWords}`)
	const lower = description.toLowerCase()
	const generic = genericPhrases.filter((phrase) => lower.includes(phrase))
	if (generic.length) problems.push(`the description uses ${generic.map((phrase) => `"${phrase}"`).join(', ')}`)
	return problems.length
		? { id: 'TRG-7', status: 'fail', message: problems.join('; '), file: 'SKILL.md' }
		: { id: 'TRG-7', status: 'pass' }
}

/**
 * The Trigger aspect's script checks: TRG-5, a name-only skill's description takes the allowed form, and TRG-7,
 * a matched skill's description is specific. Each is skipped on the other kind of skill.
 */
export function checkTrigger(skill: SkillFiles): CheckOutcome[] {
	if (!isNameOnly(skill))
		return [{ id: 'TRG-5', status: 'skipped', message: 'the skill is not name-only' }, checkSpecific(skill)]
	const problem = nameOnlyFormProblem(skill)
	return [
		problem ? { id: 'TRG-5', status: 'fail', message: problem, file: 'SKILL.md' } : { id: 'TRG-5', status: 'pass' },
		{ id: 'TRG-7', status: 'skipped', message: 'the skill is name-only' },
	]
}
