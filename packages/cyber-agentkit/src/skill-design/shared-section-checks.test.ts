import { describe, expect, it } from 'vitest'
import { checkSharedSections, sharedInputs } from './shared-section-checks.js'
import { scopedSkill, scopedSkillFiles } from './skill-design.fixtures.js'
import { sharedInputHint } from './stale-cases.js'

const withShared = (line: string) =>
	scopedSkill({
		'SKILL.md': (scopedSkillFiles['SKILL.md'] as string).replace('## Done when', `${line}\n\n## Done when`),
	})

describe('SHP-22: a shared section makes one edit re-run every scope (#417)', () => {
	it('passes a skill whose shared sections link no file', () => {
		expect(checkSharedSections(scopedSkill())).toEqual({ id: 'SHP-22', status: 'pass' })
	})

	it('warns on a shared link to a file only some parts use, naming the file, the parts, and the cases', () => {
		const outcome = checkSharedSections(withShared('Before writing, read [the style guide](references/style.md).'))
		expect(outcome).toMatchObject({ id: 'SHP-22', status: 'fail', file: 'SKILL.md' })
		expect(outcome.message).toContain('references/style.md')
		expect(outcome.message).toContain('only write use (1 of 2 parts)')
		expect(outcome.message).toMatch(/re-runs all \d+ cases/)
	})

	it('names no part for a shared link that none uses', () => {
		const linked = scopedSkill({
			'SKILL.md': (scopedSkillFiles['SKILL.md'] as string).replace(
				'## Done when',
				'See [extra](references/extra.md).\n\n## Done when',
			),
			'references/extra.md': '# Extra\n',
		})
		expect(sharedInputs(linked).map((item) => [item.what, item.users])).toEqual([['references/extra.md', []]])
	})

	it('passes a link every part uses', () => {
		const skill = withShared('Read [the style guide](references/style.md).')
		const both = scopedSkill({
			'SKILL.md': skill.body,
			'references/audit.md': '# Audit\n\n1. Read the notes by [the style guide](style.md).\n',
		})
		expect(checkSharedSections(both)).toEqual({ id: 'SHP-22', status: 'pass' })
	})

	it('warns on a section of a named reference that only some parts name', () => {
		const files = scopedSkillFiles['SKILL.md'] as string
		const skill = scopedSkill({
			'SKILL.md': files
				.replace('description:', 'metadata:\n  references: guide.rules\ndescription:')
				.replace(
					'## Done when',
					'Load `guide.rules` with the `reference` skill and follow its Budget.\n\n## Done when',
				),
			'references/write.md': '# Write\n\nRespect the Budget.\n',
		})
		const content = '# Rules\n\n## Budget\n\nSpend little.\n\n## Colors\n\nUse few.\n'
		const found = sharedInputs(skill, (name) => (name === 'guide.rules' ? content : undefined))
		expect(found.map((item) => [item.what, item.users])).toEqual([
			['the "Budget" section of the `guide.rules` reference', ['write']],
		])
	})
})

describe('the --estimate hint when one input stales every scope (#417)', () => {
	const selection = (inputs: Record<string, string[]>) =>
		({
			stale: ['a', 'b'],
			scopes: Object.entries(inputs).map(([scope, inputsChanged]) => ({ scope, cases: [scope], inputsChanged })),
			current: 0,
		}) as Parameters<typeof sharedInputHint>[0]

	it('names the input every scope changed', () => {
		const hint = sharedInputHint(selection({ root: ['a.md', 'x'], write: ['a.md'] }), ['root', 'write'])
		expect(hint).toContain('`a.md` changed in every scope')
	})

	it('adds nothing when a scope is untouched or the inputs differ', () => {
		expect(sharedInputHint(selection({ root: ['a.md'], write: ['a.md'] }), ['root', 'write', 'audit'])).toBeUndefined()
		expect(sharedInputHint(selection({ root: ['a.md'], write: ['b.md'] }), ['root', 'write'])).toBeUndefined()
	})
})
