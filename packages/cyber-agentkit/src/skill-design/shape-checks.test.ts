import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkShape, checkShapeBody } from './shape-checks.js'
import { byId, goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import { checkTrigger } from './trigger-checks.js'

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
		expect(byId(checkShape(makeSkill({ 'SKILL.md': md })))['SHP-1']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('lines'),
		})
	})

	it('fails a body under 500 lines that is over about 5,000 tokens, and names the estimate', () => {
		const md = `${goodSkillMd}${`${'word '.repeat(200)}\n`.repeat(25)}`
		const outcome = byId(checkShape(makeSkill({ 'SKILL.md': md })))['SHP-1']
		expect(outcome).toMatchObject({ status: 'fail' })
		expect(outcome?.message).toMatch(/about \d+ tokens/)
		expect(outcome?.message).not.toContain('lines')
	})

	it('passes a body just under about 5,000 tokens', () => {
		const md = `${goodSkillMd}${`${'word '.repeat(150)}\n`.repeat(25)}`
		expect(byId(checkShape(makeSkill({ 'SKILL.md': md })))['SHP-1']).toMatchObject({ status: 'pass' })
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

describe('checkShapeBody', () => {
	it('passes a body of steps whose scripts print what the agent needs', () => {
		expect(checkShapeBody(goodSkill()).map((outcome) => outcome.status)).toEqual(['pass', 'pass', 'pass'])
	})

	it('fails a body with no numbered steps and no `##` sections, a lone title not counting', () => {
		const md = goodSkillMd.replace(/\n# Release notes[\s\S]*$/, '\n# Release notes\n\nWrite good notes.\n')
		expect(byId(checkShapeBody(makeSkill({ 'SKILL.md': md })))['SHP-12']).toMatchObject({
			status: 'fail',
			file: 'SKILL.md',
		})
	})

	it('passes numbered steps with no sections', () => {
		const md = goodSkillMd.replace(/\n# Release notes[\s\S]*$/, '\n1. Read the pull requests.\n')
		expect(byId(checkShapeBody(makeSkill({ 'SKILL.md': md })))['SHP-12']).toMatchObject({ status: 'pass' })
	})

	it("fails a step that parses a bundled script's output, with its file and line, in references too", () => {
		const skill = goodSkill({
			'scripts/notes.mjs': 'console.log("ok")\n',
			'references/run.md': 'Run the script.\nThen parse the output for the version.\n',
		})
		expect(byId(checkShapeBody(skill))['SHP-13']).toMatchObject({
			status: 'fail',
			file: 'references/run.md',
			message: "references/run.md:2 tells the agent to parse a script's output",
		})
	})

	it('passes parsing JSON output, quoted examples, and a skill with no scripts', () => {
		const json = goodSkill({
			'scripts/notes.mjs': '',
			'references/run.md': 'Parse the output of `notes --format json`.\n\n```md\nparse the output\n```\n',
		})
		expect(byId(checkShapeBody(json))['SHP-13']).toMatchObject({ status: 'pass' })
		const none = goodSkill({ 'references/run.md': 'Run `git log`, then parse the output.\n' })
		expect(byId(checkShapeBody(none))['SHP-13']).toMatchObject({ status: 'pass' })
	})

	it('fails a script that prompts with no `--yes` flag, or one the Markdown does not document', () => {
		const ask = "import { createInterface } from 'node:readline'\n"
		expect(byId(checkShapeBody(goodSkill({ 'scripts/ask.mjs': ask })))['SHP-14']).toMatchObject({
			status: 'fail',
			file: 'scripts/ask.mjs',
			message: 'scripts/ask.mjs prompts the user and has no `--yes` flag',
		})
		const flag = `${ask}if (process.argv.includes('--yes')) skip()\n`
		expect(byId(checkShapeBody(goodSkill({ 'scripts/ask.mjs': flag })))['SHP-14']).toMatchObject({
			status: 'fail',
			message: 'scripts/ask.mjs prompts the user, and no Markdown the agent reads documents `--yes`',
		})
		const documented = goodSkill({
			'scripts/ask.mjs': flag,
			'SKILL.md': `${goodSkillMd}\nIn an unattended run, pass \`--yes\`.\n`,
		})
		expect(byId(checkShapeBody(documented))['SHP-14']).toMatchObject({ status: 'pass' })
	})
})

describe('the shipped skills', () => {
	const root = fileURLToPath(new URL('../../skills', import.meta.url))
	for (const name of readdirSync(root)) {
		it(`${name} passes the body and description checks`, () => {
			const skill = readSkill(`${root}/${name}`) as SkillFiles
			const outcomes = [...checkShapeBody(skill), ...checkTrigger(skill)]
			expect(outcomes.filter((outcome) => outcome.status !== 'pass' && outcome.status !== 'skipped')).toEqual([])
		})
	}
})
