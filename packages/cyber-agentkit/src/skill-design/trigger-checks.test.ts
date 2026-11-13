import { describe, expect, it } from 'vitest'
import { isNameOnly } from './name-only-skills.js'
import { goodSkill, goodSkillMd } from './skill-design.fixtures.js'
import { checkTrigger } from './trigger-checks.js'

const withDescription = (description: string) =>
	goodSkill({
		'SKILL.md': goodSkillMd.replace(/^description: .*$/m, `description: ${JSON.stringify(description)}`),
	})

describe('isNameOnly', () => {
	it('recognizes a `By name only` or `Partial Skill:` description, and nothing else', () => {
		expect(isNameOnly(withDescription('By name only'))).toBe(true)
		expect(isNameOnly(withDescription('by name only.'))).toBe(true)
		expect(isNameOnly(withDescription('Partial Skill: invoke by name only'))).toBe(true)
		expect(isNameOnly(goodSkill())).toBe(false)
		expect(isNameOnly(withDescription('Use this skill when the user asks by name only'))).toBe(false)
	})
})

describe('checkTrigger (TRG-5)', () => {
	it('skips a skill that is not name-only', () => {
		expect(checkTrigger(goodSkill())).toEqual([
			{ id: 'TRG-5', status: 'skipped', message: 'the skill is not name-only' },
		])
	})

	it('passes `By name only` and a `Partial Skill:` description with no trigger phrase', () => {
		for (const description of ['By name only', 'Partial Skill: invoke by name only'])
			expect(checkTrigger(withDescription(description))).toEqual([{ id: 'TRG-5', status: 'pass' }])
	})

	it('fails a description that is not in the allowed form, naming what is wrong', () => {
		const cases: [string, string][] = [
			['By name only.', 'not exactly "By name only"'],
			['Partial Skill:', 'neither exactly "By name only"'],
			['partial skill: the judge', 'neither exactly "By name only"'],
			['Partial Skill: use when grading a spec', 'trigger phrase "use when"'],
			['Partial Skill: the judge. Use this skill when asked to grade', 'trigger phrase "Use this skill when"'],
			['Partial Skill: when to use: grading', 'trigger phrase "when to use"'],
		]
		for (const [description, message] of cases)
			expect(checkTrigger(withDescription(description))).toEqual([
				{ id: 'TRG-5', status: 'fail', message: expect.stringContaining(message), file: 'SKILL.md' },
			])
	})
})
