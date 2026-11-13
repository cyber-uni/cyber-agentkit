import type { SkillFiles } from './skill-files.js'

/**
 * A name-only skill is loaded by name by another skill and never matched to a user request. Its description
 * declares it: `By name only`, or a `Partial Skill:` lead (cyber-sdd's convention, its ADR-0031). The
 * description is the only text the model matches against, so a name-only skill keeps it free of anything to match.
 */
const marker = /^(by name only\.?$|partial skill:)/i

/** The phrases that tell the model when to use a skill, which a name-only description must not carry. */
const triggerPhrase =
	/\buse (this skill |it )?(when|for)\b|\bwhen to use\b|\bwhen the user\b|\btrigger(s|ed)? (on|when)\b/i

/** The skill's description, trimmed, or `undefined` when it has none. */
function descriptionOf(skill: SkillFiles): string | undefined {
	const description = skill.frontmatter?.['description']
	return typeof description === 'string' ? description.trim() : undefined
}

/** Whether the skill's description declares it name-only. */
export function isNameOnly(skill: SkillFiles): boolean {
	const description = descriptionOf(skill)
	return description !== undefined && marker.test(description)
}

/** What is wrong with a name-only skill's description (TRG-5), or `undefined` when it takes the allowed form. */
export function nameOnlyFormProblem(skill: SkillFiles): string | undefined {
	const description = descriptionOf(skill) ?? ''
	if (description === 'By name only') return undefined
	if (/^by name only\.?$/i.test(description)) return `the description is "${description}", not exactly "By name only"`
	if (!/^Partial Skill: \S/.test(description))
		return `the description "${description}" is neither exactly "By name only" nor "Partial Skill: " followed by text`
	const phrase = triggerPhrase.exec(description)
	if (phrase) return `the description carries the trigger phrase "${phrase[0]}"`
	return undefined
}
