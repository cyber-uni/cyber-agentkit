import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkLayout } from './layout-checks.js'
import { byId, goodSkillMd, makeSkill } from './skill-design.fixtures.js'
import { readSkill, type SkillFiles } from './skill-files.js'

/** A skill at `<repository>/<at>/release-notes`, in a folder that holds `.git`, with the repository files given. */
function skillAt(at: string, files: Record<string, string>, repository: Record<string, string> = {}): SkillFiles {
	const root = mkdtempSync(join(tmpdir(), 'layout-'))
	mkdirSync(join(root, '.git'))
	const write = (base: string, all: Record<string, string>) => {
		for (const [path, text] of Object.entries(all)) {
			mkdirSync(dirname(join(base, path)), { recursive: true })
			writeFileSync(join(base, path), text)
		}
	}
	write(root, repository)
	const folder = join(root, at, 'release-notes')
	write(folder, files)
	return readSkill(folder) as SkillFiles
}

describe('checkLayout', () => {
	it('passes a skill in a skills root with only the standard folders', () => {
		const outcomes = checkLayout(
			makeSkill({
				'SKILL.md': goodSkillMd,
				'README.md': 'x',
				'skill.json': '{"distribution":{"install_via":"package_manager","package":{"name":"p"}}}',
				'references/a.md': 'x',
				'scripts/a.mjs': 'x',
				'assets/logo.png': 'x',
				'evals/evals.yaml': 'x',
				'agents/openai.yaml': 'x',
			}),
		)
		expect(outcomes.map(({ id, status }) => `${id} ${status}`)).toEqual([
			'SHP-7 pass',
			'SHP-8 pass',
			'SHP-9 pass',
			'SHP-10 pass',
			'SHP-11 pass',
		])
	})

	it('SHP-7 fails a skill folder that is not directly in a skills folder', () => {
		const skill = skillAt('tools', { 'SKILL.md': goodSkillMd })
		expect(byId(checkLayout(skill))['SHP-7']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('"tools"'),
		})
	})

	it('SHP-8 fails a shipped skill that points outside its folder', () => {
		const md = `${goodSkillMd}\nSee [guide](../../docs/guide.md), \`docs/guide.md\`, and ../other/SKILL.md; [own](references/a.md).\n`
		const skill = skillAt(
			'skills',
			{ 'SKILL.md': md, 'references/a.md': 'Run ../scripts/a.mjs and read src/index.ts.', 'scripts/a.mjs': 'x' },
			{ 'docs/guide.md': 'x', 'src/index.ts': 'x' },
		)
		const outcome = byId(checkLayout(skill))['SHP-8']
		expect(outcome).toMatchObject({ status: 'fail', file: 'SKILL.md' })
		expect(outcome?.message).toContain('points to ../../docs/guide.md')
		expect(outcome?.message).toContain('points to docs/guide.md')
		expect(outcome?.message).toContain('points to ../other/SKILL.md')
		expect(outcome?.message).toContain('references/a.md points to src/index.ts')
		expect(outcome?.message).not.toContain('../scripts/a.mjs')
		expect(outcome?.message).not.toContain('references/a.md,')
	})

	it('SHP-8 passes a repository path that does not exist, and a skill in a dot-folder root', () => {
		const md = `${goodSkillMd}\nPut the code in src/index.ts and read ../../docs/guide.md.\n`
		expect(
			byId(checkLayout(skillAt('skills', { 'SKILL.md': `${goodSkillMd}\nWrite src/new.ts.\n` })))['SHP-8'],
		).toMatchObject({
			status: 'pass',
		})
		expect(
			byId(checkLayout(skillAt('.agents/skills', { 'SKILL.md': md }, { 'src/index.ts': 'x' })))['SHP-8'],
		).toMatchObject({
			status: 'pass',
		})
	})

	it.each([
		['{', 'not valid JSON'],
		['[]', 'not an object'],
		['{"distribution":{"install_via":"curl"}}', '"curl", not "package_manager"'],
		['{"distribution":{}}', 'missing, not "package_manager"'],
		['{"distribution":{"install_via":"package_manager"}}', 'no `distribution.package.name`'],
	])('SHP-9 fails skill.json %s', (json, message) => {
		const outcome = byId(checkLayout(makeSkill({ 'SKILL.md': goodSkillMd, 'skill.json': json })))['SHP-9']
		expect(outcome).toMatchObject({ status: 'fail', file: 'skill.json', message: expect.stringContaining(message) })
	})

	it('SHP-9 passes skill.json with no distribution', () => {
		expect(byId(checkLayout(makeSkill({ 'SKILL.md': goodSkillMd, 'skill.json': '{}' })))['SHP-9']).toMatchObject({
			status: 'pass',
		})
	})

	it('SHP-10 fails a non-standard folder and non-YAML files in agents/', () => {
		const outcome = byId(
			checkLayout(
				makeSkill({
					'SKILL.md': goodSkillMd,
					'docs/a.md': 'x',
					'agents/openai.yaml': 'x',
					'agents/reviewer.md': 'x',
					'.github/x.yml': 'x',
				}),
			),
		)['SHP-10']
		expect(outcome).toMatchObject({ status: 'fail', file: 'docs/' })
		expect(outcome?.message).toContain('docs/ is not a standard skill folder')
		expect(outcome?.message).toContain('agents/reviewer.md is in agents/, which holds YAML only')
		expect(outcome?.message).not.toContain('.github')
		expect(outcome?.message).not.toContain('openai.yaml')
	})

	it('SHP-11 fails static resources and extra Markdown in the root', () => {
		const outcome = byId(
			checkLayout(
				makeSkill({
					'SKILL.md': goodSkillMd,
					'README.md': 'x',
					'logo.png': 'x',
					'config.yaml': 'x',
					'report.template.md': 'x',
					'GUIDE.md': 'x',
					'skill.json': '{}',
				}),
			),
		)['SHP-11']
		expect(outcome).toMatchObject({ status: 'fail' })
		expect(outcome?.message).toContain('GUIDE.md is extra documentation; move it to references/')
		for (const file of ['logo.png', 'config.yaml', 'report.template.md'])
			expect(outcome?.message).toContain(`${file} is a static resource; move it to assets/`)
		expect(outcome?.message).not.toMatch(/README|SKILL|skill\.json/)
	})
})
