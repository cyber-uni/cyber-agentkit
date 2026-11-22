import { mkdirSync, mkdtempSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { capabilitiesInterface } from '../references/reference-interface.fixtures.js'
import { referenceLayers } from '../references/reference-layers.js'
import { doctorSkills } from './skill-doctor.js'

function write(root: string, path: string, text: string): string {
	const file = join(root, path)
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, text)
	return file
}

function repo(): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-')))
	mkdirSync(join(root, '.git'))
	return root
}

/** A plugin installed as a dependency of the repository, holding the given references. */
function plugin(root: string, name: string, references: Record<string, string>): void {
	write(root, 'package.json', JSON.stringify({ name: 'fixture', dependencies: { [name]: '1.0.0' } }))
	const dir = join('node_modules', name)
	write(root, join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
	write(root, join(dir, 'plugin.json'), JSON.stringify({ name }))
	for (const [ref, text] of Object.entries(references)) write(root, join(dir, 'references', `${ref}.md`), text)
}

function skill(root: string, name: string, body: string, defaults: Record<string, string> = {}) {
	const folder = join(root, 'skills', name)
	write(folder, 'SKILL.md', `---\nname: ${name}\ndescription: a skill\n---\n\n# ${name}\n\n${body}\n`)
	for (const [ref, text] of Object.entries(defaults)) write(folder, `references/${ref}.default.md`, text)
	return { name, folder }
}

const layersOf = (root: string) =>
	referenceLayers({
		root,
		cwd: root,
		home: realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-home-'))),
		platform: 'linux',
		env: {},
	})

const github = (sections: string) =>
	`---\ndescription: GitHub.\nimplements: project-tracker.capabilities@1\n---\n\n${sections}`
const loadTrackers =
	'Load the implementations of the `project-tracker.capabilities` interface with the `reference` skill of `cyber-agentkit`.'

describe('doctorSkills', () => {
	it('reports a repository override that fails its interface, names its file, and says what to do', async () => {
		const root = repo()
		plugin(root, 'trackers', {
			'project-tracker.capabilities.interface': capabilitiesInterface,
			'project-tracker.capabilities.github': github('## Tracker\n\nGitHub\n\n## Detect\n\nA github.com remote.\n'),
		})
		const override = write(
			root,
			'.agents/references/project-tracker.capabilities.github.md',
			'---\ndescription: Ours.\nimplements: project-tracker.capabilities@1\nmerge: replace\n---\n\n## Tracker\n\nOurs\n',
		)
		const report = doctorSkills([skill(root, 'issue', loadTrackers)], await layersOf(root))
		expect(report.status).toBe('failed')
		const [entry] = report.skills
		expect(entry?.interfaces).toEqual(['project-tracker.capabilities'])
		const broken = entry?.references.find(({ name }) => name === 'project-tracker.capabilities.github')
		expect(broken).toMatchObject({ status: 'failed', file: override })
		expect(broken?.answeredBy.at(-1)).toBe('repo')
		expect(broken?.failures?.[0]?.message).toContain('Detect')
		expect(broken?.failures?.[0]?.action).toContain('reference customize project-tracker.capabilities.github')
		expect(entry?.references.find(({ name }) => name === 'project-tracker.capabilities.interface')).toMatchObject({
			status: 'passed',
			answeredBy: ['plugin trackers'],
		})
	})

	it('passes a skill whose bundled default answers what it loads', async () => {
		const root = repo()
		const found = skill(root, 'notes', 'Load `notes.template` with the `reference` skill of `cyber-agentkit`.', {
			'notes.template': '## Template\n\nA note.\n',
		})
		const report = doctorSkills([found], await layersOf(root))
		expect(report).toEqual({
			status: 'passed',
			skills: [
				{
					skill: 'notes',
					folder: found.folder,
					status: 'passed',
					references: [
						{
							name: 'notes.template',
							status: 'passed',
							answeredBy: ['default'],
							file: join(found.folder, 'references', 'notes.template.default.md'),
						},
					],
				},
			],
		})
	})

	it('fails a name no tier holds, and points to installing a plugin or creating one', async () => {
		const root = repo()
		const report = doctorSkills(
			[skill(root, 'triage', 'Load `triage.rules` with the `reference` skill of `cyber-agentkit`.')],
			await layersOf(root),
		)
		const reference = report.skills[0]?.references[0]
		expect(reference).toMatchObject({ name: 'triage.rules', status: 'missing', answeredBy: [] })
		expect(reference?.failures?.[0]).toMatchObject({ code: 'reference-missing' })
		expect(reference?.failures?.[0]?.action).toContain('reference create triage.rules')
	})

	it('checks the names a skill declares under `metadata.references`, and no other name it mentions', async () => {
		const root = repo()
		const folder = join(root, 'skills', 'triage')
		write(
			folder,
			'SKILL.md',
			'---\nname: triage\ndescription: a skill\nmetadata:\n  references: triage.rules\n---\n\nRead `triage.rules`. `triage.other` is an example.\n',
		)
		write(folder, 'references/triage.other.default.md', '## Other\n\nx\n')
		const report = doctorSkills([{ name: 'triage', folder }], await layersOf(root))
		expect(report.skills[0]?.references.map(({ name, status }) => ({ name, status }))).toEqual([
			{ name: 'triage.rules', status: 'missing' },
		])
	})

	it('checks a backticked name that resolves when the skill declares none, in a skill not written in English', async () => {
		const root = repo()
		const found = skill(root, 'notas', 'Carga `notas.tono` con la skill `reference` y escribe en ese tono.', {
			'notas.tono': '## Tono\n\nclaro\n',
		})
		const report = doctorSkills([found], await layersOf(root))
		expect(report.skills[0]?.references.map(({ name, status }) => ({ name, status }))).toEqual([
			{ name: 'notas.tono', status: 'passed' },
		])
	})

	it('reads only what an agent reads when the skill runs: no fenced example, README, or eval fixture', async () => {
		const root = repo()
		const found = skill(
			root,
			'wiring',
			'Copy this line:\n\n```text\nLoad `<name>` with the `reference` skill of `cyber-agentkit`.\nSee [it](README.md).\n```\n\nSee [steps](references/steps.md).',
		)
		write(found.folder, 'README.md', 'Load `readme.only` with the `reference` skill of `cyber-agentkit`.\n')
		write(
			found.folder,
			'evals/files/x/SKILL.md',
			'Load `fixture.only` with the `reference` skill of `cyber-agentkit`.\n',
		)
		write(found.folder, 'references/steps.md', 'Load `steps.real` with the `reference` skill of `cyber-agentkit`.\n')
		const report = doctorSkills([found], await layersOf(root))
		expect(report.skills[0]?.references.map(({ name }) => name)).toEqual(['steps.real'])
		expect(report.skills[0]?.notes).toBeUndefined()
	})

	it('follows every file the skill links or names, wherever it sits, and points to check for one outside references/', async () => {
		const root = repo()
		write(root, 'shared/rules.md', 'Load `shared.rules` with the `reference` skill of `cyber-agentkit`.\n')
		const found = skill(
			root,
			'linker',
			'Read [the steps](docs/steps.md) and [the rules](../../shared/rules.md), not `README.md`.',
		)
		write(found.folder, 'docs/steps.md', 'Then see [more](../references/more.md#top).\n')
		write(found.folder, 'references/more.md', 'Load `more.real` with the `reference` skill of `cyber-agentkit`.\n')
		write(found.folder, 'references/unlinked.md', 'Load `never.read` with the `reference` skill of `cyber-agentkit`.\n')
		const [entry] = doctorSkills([found], await layersOf(root)).skills
		expect(entry?.references.map(({ name }) => name).sort()).toEqual(['more.real', 'shared.rules'])
		expect(entry?.status).toBe('failed')
		expect(entry?.notes).toEqual([
			expect.stringMatching(/^docs\/steps\.md is read .*outside references\/ and assets\/; `skill check`/),
			expect.stringMatching(/shared\/rules\.md is read .*outside references\/ and assets\//),
		])
	})

	it("does not follow a harness's own file under agents/ whose harness is not verified", async () => {
		const root = repo()
		const found = skill(root, 'agenty', 'See [its other file](agents/other.md).')
		write(found.folder, 'agents/other.md', 'Load `x.rules` with the `reference` skill of `cyber-agentkit`.\n')
		const [entry] = doctorSkills([found], await layersOf(root)).skills
		expect(entry).toMatchObject({ status: 'passed', references: [] })
		expect(entry?.notes).toEqual([expect.stringMatching(/^agents\/other\.md is for one harness/)])
	})

	describe("Codex's agents/openai.yaml", () => {
		const codexSkill = (root: string, metadata: string, body = 'See [its Codex file](agents/openai.yaml).') => {
			const found = skill(root, 'codexy', body)
			write(found.folder, 'agents/openai.yaml', metadata)
			return found
		}

		it('is not examined when Codex is not the harness checked, and a note says so', async () => {
			const root = repo()
			const found = codexSkill(root, 'interface: [unclosed\n')
			for (const harness of [undefined, 'unknown', 'claude-code'] as const) {
				const [entry] = doctorSkills([found], await layersOf(root), { harness }).skills
				expect(entry).toMatchObject({ status: 'passed', references: [] })
				expect(entry?.warnings).toBeUndefined()
				expect(entry?.notes).toEqual([
					expect.stringMatching(/^agents\/openai\.yaml is read by Codex, which is not checked here/),
				])
			}
		})

		it('passes a valid file with icons under assets/ when Codex is checked', async () => {
			const root = repo()
			const found = codexSkill(root, 'interface:\n  display_name: Codexy\n  icon_small: ./assets/small.svg\n')
			write(found.folder, 'assets/small.svg', '<svg/>')
			const [entry] = doctorSkills([found], await layersOf(root), { harness: 'codex' }).skills
			expect(entry).toMatchObject({ status: 'passed', references: [] })
			expect(entry?.warnings).toBeUndefined()
			expect(entry?.notes).toBeUndefined()
		})

		it('warns that Codex ignores a file that is not valid YAML', async () => {
			const root = repo()
			const found = codexSkill(root, 'interface: [unclosed\n', 'Just prose.')
			const [entry] = doctorSkills([found], await layersOf(root), { harness: 'codex' }).skills
			expect(entry?.status).toBe('warned')
			expect(entry?.warnings).toEqual([
				expect.objectContaining({ code: 'codex-metadata-invalid', message: expect.stringContaining('not valid YAML') }),
			])
		})

		it('warns that Codex ignores a file that is not a mapping', async () => {
			const root = repo()
			const found = codexSkill(root, '- one\n- two\n')
			const [entry] = doctorSkills([found], await layersOf(root), { harness: 'codex' }).skills
			expect(entry?.warnings?.map(({ code }) => code)).toEqual(['codex-metadata-invalid'])
		})

		it('warns on an icon outside assets/ and on one that does not exist', async () => {
			const root = repo()
			const found = codexSkill(root, 'interface:\n  icon_small: ./logo.svg\n  icon_large: assets/large.png\n')
			const [entry] = doctorSkills([found], await layersOf(root), { harness: 'codex' }).skills
			expect(entry?.status).toBe('warned')
			expect(entry?.warnings?.map(({ code, message }) => [code, message])).toEqual([
				['codex-icon-ignored', expect.stringContaining('interface.icon_small')],
				['codex-icon-missing', expect.stringContaining('assets/large.png')],
			])
		})

		it('notes a policy that turns off implicit invocation', async () => {
			const root = repo()
			const found = codexSkill(root, 'policy:\n  allow_implicit_invocation: false\n')
			const [entry] = doctorSkills([found], await layersOf(root), { harness: 'codex' }).skills
			expect(entry?.status).toBe('passed')
			expect(entry?.notes).toEqual([expect.stringContaining('only when it is named')])
		})
	})

	it('passes a skill that loads no reference', async () => {
		const root = repo()
		const report = doctorSkills([skill(root, 'plain', 'Just prose.')], await layersOf(root))
		expect(report.skills[0]).toMatchObject({ status: 'passed', references: [] })
	})

	it('writes nothing', async () => {
		const root = repo()
		skill(root, 'triage', 'Load `triage.rules` with the `reference` skill of `cyber-agentkit`.')
		const before = readdirSync(root, { recursive: true }).sort()
		doctorSkills([{ name: 'triage', folder: join(root, 'skills', 'triage') }], await layersOf(root))
		expect(readdirSync(root, { recursive: true }).sort()).toEqual(before)
	})
})
