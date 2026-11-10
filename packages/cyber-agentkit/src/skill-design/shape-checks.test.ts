import { describe, expect, it } from 'vitest'
import { checkShape } from './shape-checks.js'
import { byId, goodSkillMd, makeSkill } from './skill-design.fixtures.js'

describe('checkShape', () => {
	it('passes a body whose links resolve and whose references are all linked, through linked files too', () => {
		const md = `${goodSkillMd}\nSee [create](references/create.md) and [docs](https://example.com).\n`
		const outcomes = checkShape(
			makeSkill({
				'SKILL.md': md,
				'references/create.md': 'Then [check](check.md#run).',
				'references/check.md': 'x',
				'references/skill-design.autonomy.default.md': 'loaded by name',
			}),
		)
		expect(outcomes.map((outcome) => outcome.status)).toEqual(['pass', 'pass'])
	})

	it('fails a body over 500 lines', () => {
		const md = `${goodSkillMd}${'line\n'.repeat(500)}`
		expect(byId(checkShape(makeSkill({ 'SKILL.md': md })))['SHP-1']).toMatchObject({ status: 'fail' })
	})

	it('fails a broken link and an unlinked reference, ignoring links inside code fences', () => {
		const md = `${goodSkillMd}\n[gone](references/gone.md)\n\n\`\`\`md\n[fenced](references/fenced.md)\n\`\`\`\n`
		const outcome = byId(checkShape(makeSkill({ 'SKILL.md': md, 'references/orphan.md': 'x' })))['SHP-2']
		expect(outcome).toMatchObject({ status: 'fail' })
		expect(outcome?.message).toContain('references/gone.md, which does not exist')
		expect(outcome?.message).toContain('references/orphan.md is not linked')
		expect(outcome?.message).not.toContain('fenced')
	})
})
