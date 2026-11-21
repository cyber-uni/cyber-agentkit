import { describe, expect, it } from 'vitest'
import { checkCriteria } from './criteria-checks.js'
import { byId, goodSkill, goodSkillMd, makeSkill, routerSkillFiles } from './skill-design.fixtures.js'
import { criteriaItems } from './skill-files.js'

describe('checkCriteria', () => {
	it('passes a Done when list of unique C<n> items', () => {
		expect(checkCriteria(goodSkill()).map((outcome) => outcome.status)).toEqual(['pass', 'pass'])
	})

	it('fails CRI-1 with no Done when section, or an empty one, and leaves CRI-2 not checked', () => {
		const none = byId(checkCriteria(makeSkill({ 'SKILL.md': goodSkillMd.replace(/## Done when[\s\S]*/, '') })))
		expect(none['CRI-1']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('no `## Done when` section, and every skill needs one'),
		})
		expect(none['CRI-1']?.message).toContain('`- **C1.** <a statement true or false of the result>`')
		expect(none['CRI-2']).toMatchObject({ status: 'not-checked' })
		const empty = byId(checkCriteria(makeSkill({ 'SKILL.md': goodSkillMd.replace(/- \*\*C[\s\S]*/, '') })))
		expect(empty['CRI-1']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('that does; add at least one item as `- **C1.**'),
		})
	})

	it('fails CRI-2 for an item without an ID and for a repeated ID', () => {
		const md = goodSkillMd.replace('- **C2.** No merge commit appears.', '- **C1.** Again.\n- No ID here.')
		expect(byId(checkCriteria(makeSkill({ 'SKILL.md': md })))['CRI-2']).toMatchObject({
			status: 'fail',
			message: 'item 3 has no `C<n>` ID; C1 appears more than once',
		})
	})

	describe('a router skill (#337)', () => {
		it('passes when SKILL.md points to per-command lists in the reference files it links', () => {
			expect(byId(checkCriteria(makeSkill(routerSkillFiles)))).toEqual({
				'CRI-1': { id: 'CRI-1', status: 'pass' },
				'CRI-2': { id: 'CRI-2', status: 'pass' },
			})
		})

		it('fails CRI-2 for an ID repeated across two command files, naming both', () => {
			const review = routerSkillFiles['references/review.md'].replace('**C3.**', '**C2.**')
			expect(byId(checkCriteria(makeSkill({ ...routerSkillFiles, 'references/review.md': review })))['CRI-2']).toEqual({
				id: 'CRI-2',
				status: 'fail',
				message: 'C2 appears more than once (in references/write.md, references/review.md)',
				file: 'references/write.md',
			})
		})

		it('names the file of an item with no ID', () => {
			const review = routerSkillFiles['references/review.md'].replace('- **C3.** ', '- ')
			expect(
				byId(checkCriteria(makeSkill({ ...routerSkillFiles, 'references/review.md': review })))['CRI-2']?.message,
			).toBe('item 1 in references/review.md has no `C<n>` ID')
		})

		it('ignores a Done when list in a reference file the body does not link', () => {
			const md = routerSkillFiles['SKILL.md']
				.replace(/\| `review`.*\n/, '')
				.replace(' and [review](references/review.md#done-when)', '')
			const items = criteriaItems(makeSkill({ ...routerSkillFiles, 'SKILL.md': md }))
			expect(items?.ids).toEqual(['C1', 'C2'])
		})

		it('still fails CRI-1 when neither SKILL.md nor a linked file lists an item', () => {
			const files = {
				...routerSkillFiles,
				'references/write.md': routerSkillFiles['references/write.md'].replace(/## Done when[\s\S]*/, ''),
				'references/review.md': routerSkillFiles['references/review.md'].replace(/## Done when[\s\S]*/, ''),
			}
			expect(byId(checkCriteria(makeSkill(files)))['CRI-1']).toMatchObject({
				status: 'fail',
				message: expect.stringContaining('no reference file the body links has a `## Done when` that does'),
			})
			const noSection = { ...files, 'SKILL.md': routerSkillFiles['SKILL.md'].replace(/## Done when[\s\S]*/, '') }
			expect(byId(checkCriteria(makeSkill(noSection)))['CRI-1']).toMatchObject({
				status: 'fail',
				message: expect.stringContaining('there is no `## Done when` section'),
			})
		})

		it('does not count a Done when list in a linked file when SKILL.md has none', () => {
			const md = routerSkillFiles['SKILL.md'].replace(/## Done when[\s\S]*/, '')
			expect(byId(checkCriteria(makeSkill({ ...routerSkillFiles, 'SKILL.md': md })))['CRI-1']?.status).toBe('fail')
		})
	})
})
