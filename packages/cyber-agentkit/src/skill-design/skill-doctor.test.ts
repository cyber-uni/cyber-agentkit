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

	it('reads only what an agent reads when the skill runs: no fenced example, README, or eval fixture', async () => {
		const root = repo()
		const found = skill(
			root,
			'wiring',
			'Copy this line:\n\n```text\nLoad `<name>` with the `reference` skill of `cyber-agentkit`.\n```\n\nSee [steps](references/steps.md).',
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
