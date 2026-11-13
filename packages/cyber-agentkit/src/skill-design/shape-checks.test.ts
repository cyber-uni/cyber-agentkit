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
				'references/check.md': '## Run\n',
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

describe('checkShape plain-text paths and anchors', () => {
	it('fails a plain-text path to a missing file, in prose and in code, and passes one that exists', () => {
		const md = `${goodSkillMd}\nRun \`scripts/missing.sh\`, then scripts/present.sh.\n\n\`\`\`sh\nnode scripts/gone.mjs\n\`\`\`\n`
		const outcome = byId(checkShape(makeSkill({ 'SKILL.md': md, 'scripts/present.sh': 'x' })))['SHP-2']
		expect(outcome).toMatchObject({ status: 'fail', file: 'SKILL.md' })
		expect(outcome?.message).toContain('names scripts/missing.sh, which does not exist')
		expect(outcome?.message).toContain('names scripts/gone.mjs')
		expect(outcome?.message).not.toContain('present.sh')
	})

	it('ignores placeholders, shell-expanded paths, URLs, and names outside the skill folders', () => {
		const md = `${goodSkillMd}\nWrite \`references/<name>.md\`, run \`$DIR/scripts/a.sh\` or \`<folder>/scripts/b.mjs\`, read https://x.dev/scripts/c.sh and package.json and docs/guide.md.\n`
		expect(byId(checkShape(makeSkill({ 'SKILL.md': md })))['SHP-2']).toMatchObject({ status: 'pass' })
	})

	it('resolves anchors against the headings of the file they point into', () => {
		const md = `${goodSkillMd}\nSee [steps](#steps), [done](#done-when), [fix](references/fix.md#apply-a-fix), and [gone](#nowhere).\n`
		const outcome = byId(
			checkShape(makeSkill({ 'SKILL.md': md, 'references/fix.md': '# Fix\n\n## Apply a fix\n\n[back](#missing)\n' })),
		)['SHP-2']
		expect(outcome).toMatchObject({ status: 'fail' })
		expect(outcome?.message).toContain('links SKILL.md#nowhere')
		expect(outcome?.message).toContain('references/fix.md links references/fix.md#missing')
		expect(outcome?.message).not.toMatch(/#steps|#done-when|#apply-a-fix/)
	})
})
