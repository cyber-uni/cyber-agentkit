import { describe, expect, it } from 'vitest'
import { byId, goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'
import { readSkill } from './skill-files.js'
import { checkSpec } from './spec-checks.js'

describe('checkSpec', () => {
	it('passes a skill that meets the Agent Skills specification', () => {
		expect(checkSpec(goodSkill()).map((outcome) => outcome.status)).toEqual(['pass', 'pass', 'pass', 'pass'])
	})

	it('fails every rule when there is no front matter', () => {
		const outcomes = checkSpec(makeSkill({ 'SKILL.md': '# No front matter\n' }))
		expect(outcomes.every((outcome) => outcome.status === 'fail')).toBe(true)
	})

	it('fails a name that breaks the rule or does not match the folder', () => {
		expect(byId(checkSpec(makeSkill({ 'SKILL.md': goodSkillMd }, 'other')))['SPEC-2']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('does not match the folder'),
		})
		const bad = goodSkillMd.replace('name: release-notes', 'name: Release--Notes')
		expect(byId(checkSpec(makeSkill({ 'SKILL.md': bad })))['SPEC-2']).toMatchObject({ status: 'fail' })
	})

	it('fails a missing or overlong description and an overlong compatibility', () => {
		const long = goodSkillMd.replace(
			/description: .*/,
			`description: ${'x'.repeat(1025)}\ncompatibility: ${'y'.repeat(501)}`,
		)
		const outcomes = byId(checkSpec(makeSkill({ 'SKILL.md': long })))
		expect(outcomes['SPEC-3']).toMatchObject({ status: 'fail', message: expect.stringContaining('1025') })
		expect(outcomes['SPEC-4']).toMatchObject({ status: 'fail' })
		const none = goodSkillMd.replace(/description: .*\n/, '')
		expect(byId(checkSpec(makeSkill({ 'SKILL.md': none })))['SPEC-3']).toMatchObject({ status: 'fail' })
	})

	it('reads no folder without a SKILL.md', () => {
		expect(readSkill('/nonexistent/skill')).toBeUndefined()
	})
})
