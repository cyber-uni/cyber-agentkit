import { describe, expect, it } from 'vitest'
import { checkCriteria } from './criteria-checks.js'
import { byId, goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'

describe('checkCriteria', () => {
	it('passes a Done when list of unique C<n> items', () => {
		expect(checkCriteria(goodSkill()).map((outcome) => outcome.status)).toEqual(['pass', 'pass'])
	})

	it('fails CRI-1 with no Done when section, or an empty one, and leaves CRI-2 not checked', () => {
		const none = byId(checkCriteria(makeSkill({ 'SKILL.md': goodSkillMd.replace(/## Done when[\s\S]*/, '') })))
		expect(none['CRI-1']).toMatchObject({ status: 'fail', message: expect.stringContaining('no `## Done when`') })
		expect(none['CRI-2']).toMatchObject({ status: 'not-checked' })
		const empty = byId(checkCriteria(makeSkill({ 'SKILL.md': goodSkillMd.replace(/- \*\*C[\s\S]*/, '') })))
		expect(empty['CRI-1']).toMatchObject({ status: 'fail', message: expect.stringContaining('lists no item') })
	})

	it('fails CRI-2 for an item without an ID and for a repeated ID', () => {
		const md = goodSkillMd.replace('- **C2.** No merge commit appears.', '- **C1.** Again.\n- No ID here.')
		expect(byId(checkCriteria(makeSkill({ 'SKILL.md': md })))['CRI-2']).toMatchObject({
			status: 'fail',
			message: 'item 3 has no `C<n>` ID; C1 appears more than once',
		})
	})
})
