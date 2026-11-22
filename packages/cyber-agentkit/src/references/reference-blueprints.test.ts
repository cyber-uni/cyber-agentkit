import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { blueprintKeyOf, blueprintNeeds, verifiedEntries } from './reference-blueprints.js'
import { checkReferences } from './reference-check.js'
import { json, load, plugins, repo, write } from './reference-command.fixtures.js'
import { referenceImplementations } from './reference-implementations.js'
import type { ReferenceLayer } from './reference-layers.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string>, plugin?: string): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-blueprints-'))
	for (const [name, content] of Object.entries(documents)) {
		const path = join(dir, `${name}.md`)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, content)
	}
	return plugin === undefined ? { tier, dir } : { tier, dir, plugin }
}

const doc = (body: string, frontmatter = '') => `---\ndescription: d\n${frontmatter}---\n\n${body}`

const blueprintsInterface = (cardinality = 'many') => `---
description: How a tracker's operations are done on one system.
interface:
  cardinality: ${cardinality}
  version: 1
  sections:
    - heading: Create
      required: true
    - Link
---

## Item ref

Every operation that returns an item gives the skill this record.
`

const gitlab = doc(
	'## System\n\nGitLab. Docs: https://docs.gitlab.com\n\n## Detect\n\nThe remote is a GitLab host.\n\n## Verified\n\n- 17.x Premium: run, 2026-11.\n- 17.x Free: from docs.\n\n## Epics\n\nSince: 17.0 Premium.\n\n## Issue links\n\nLinks between issues.\n',
)

const blueprint = (body: string) => doc(body, 'implements: project-tracker.blueprints@1\n')

const issues = blueprint(
	'## Create\n\nNeeds: Epics, Issue links\n\n`glab issue create`\n\n## Link\n\nNeeds: `Issue links`.\n\n`glab issue link`\n',
)

function entryOf(documents: Record<string, string>, name: string, extra: ReferenceLayer[] = []) {
	const [entry] = checkReferences([layer('plugin', documents, 'house'), ...extra], { names: [name] })
	return entry
}

describe('reading a blueprint (K41, K44)', () => {
	it('reads the system and the solution from the key, under the id or an older one', () => {
		const ids = ['project-tracker.blueprints', 'tracker.blueprints']
		expect(blueprintKeyOf('project-tracker.blueprints.asana.custom-field', ids)).toEqual({
			system: 'asana',
			solution: 'custom-field',
		})
		expect(blueprintKeyOf('tracker.blueprints.asana.sections.flat', ids)).toEqual({
			system: 'asana',
			solution: 'sections.flat',
		})
		expect(blueprintKeyOf('project-tracker.blueprints.asana', ids)).toEqual({ system: 'asana', solution: '' })
		expect(blueprintKeyOf('other.asana.x', ids)).toBeUndefined()
	})

	it('reads each Needs: line of a section and the sections below it, never one in a code fence', () => {
		const content =
			'## Create\n\nNeeds: Epics, Issue links.\n\n### Detail\n\nNeeds: Labels\n\n```\nNeeds: Fenced\n```\n\n## Link\n\nNo needs.\n'
		expect(blueprintNeeds(content)).toEqual([
			{ section: 'Create', feature: 'Epics' },
			{ section: 'Create', feature: 'Issue links' },
			{ section: 'Create', feature: 'Labels' },
		])
	})

	it("reads a capability reference's Verified entries as its list items, or its lines when it has no list", () => {
		expect(verifiedEntries(gitlab)).toEqual(['17.x Premium: run, 2026-11.', '17.x Free: from docs.'])
		expect(verifiedEntries('## Verified\n\nFrom docs, 2026-10.\n')).toEqual(['From docs, 2026-10.'])
		expect(verifiedEntries('## System\n\na\n')).toEqual([])
	})
})

describe('a blueprint interface (R143, UC30.3)', () => {
	it('passes with cardinality many', () => {
		const entry = entryOf(
			{ 'project-tracker.blueprints.interface': blueprintsInterface() },
			'project-tracker.blueprints.interface',
		)
		expect(entry).toMatchObject({ kind: 'interface', status: 'passed', failures: [] })
	})

	it('fails with cardinality one', () => {
		const entry = entryOf(
			{ 'project-tracker.blueprints.interface': blueprintsInterface('one') },
			'project-tracker.blueprints.interface',
		)
		expect(entry?.failures).toEqual([
			{
				check: 'blueprint',
				interface: 'project-tracker.blueprints',
				message: expect.stringContaining('declare cardinality many'),
			},
		])
	})
})

describe('a blueprint (UC30)', () => {
	const documents = {
		'project-tracker.blueprints.interface': blueprintsInterface(),
		'gitlab.capabilities': gitlab,
		'project-tracker.blueprints.gitlab.issues': issues,
	}

	it('passes when its capability reference is found and holds every feature it needs', () => {
		expect(entryOf(documents, 'project-tracker.blueprints.gitlab.issues')).toMatchObject({
			kind: 'implementation',
			status: 'passed',
			failures: [],
			warnings: [],
		})
	})

	it('fails when its capability reference is not found (R144, UC30.1)', () => {
		const { 'gitlab.capabilities': _, ...rest } = documents
		expect(entryOf(rest, 'project-tracker.blueprints.gitlab.issues')?.failures).toEqual([
			{
				check: 'blueprint',
				interface: 'project-tracker.blueprints',
				message: expect.stringContaining('its capability reference gitlab.capabilities is missing'),
			},
		])
	})

	it('fails a Needs: line naming a feature its capability reference has no section for (R145, UC30.2)', () => {
		const entry = entryOf(
			{ ...documents, 'project-tracker.blueprints.gitlab.issues': blueprint('## Create\n\nNeeds: Iterations\n') },
			'project-tracker.blueprints.gitlab.issues',
		)
		expect(entry?.failures).toEqual([
			{
				check: 'blueprint',
				interface: 'project-tracker.blueprints',
				message: 'section Create needs Iterations, which gitlab.capabilities has no feature section for',
			},
		])
	})

	it('does not read System, Detect, or Verified as a feature', () => {
		const entry = entryOf(
			{ ...documents, 'project-tracker.blueprints.gitlab.issues': blueprint('## Create\n\nNeeds: Detect\n') },
			'project-tracker.blueprints.gitlab.issues',
		)
		expect(entry?.failures.map(({ check }) => check)).toEqual(['blueprint'])
	})

	it('fails a name with no solution', () => {
		const entry = entryOf(
			{ ...documents, 'project-tracker.blueprints.gitlab': blueprint('## Create\n\na\n') },
			'project-tracker.blueprints.gitlab',
		)
		expect(entry?.failures).toEqual([
			{
				check: 'blueprint',
				interface: 'project-tracker.blueprints',
				message: expect.stringContaining('names no solution'),
			},
		])
	})

	it('lists each blueprint with its system and its capability reference Verified entries (R146)', () => {
		const report = referenceImplementations('project-tracker.blueprints', [layer('plugin', documents, 'house')])
		expect(report.implementations).toEqual([
			expect.objectContaining({
				pin: 'house/project-tracker.blueprints.gitlab.issues',
				system: 'gitlab',
				capability: 'gitlab.capabilities',
				verified: ['17.x Premium: run, 2026-11.', '17.x Free: from docs.'],
			}),
		])
	})

	it('leaves out a blueprint whose capability reference is not found, saying why (R144)', () => {
		const { 'gitlab.capabilities': _, ...rest } = documents
		const report = referenceImplementations('project-tracker.blueprints', [layer('plugin', rest, 'house')])
		expect(report.implementations).toEqual([])
		expect(report.excluded).toEqual([
			{
				name: 'house/project-tracker.blueprints.gitlab.issues',
				reasons: [expect.stringContaining('blueprint: its capability reference gitlab.capabilities is missing')],
			},
		])
	})

	it('builds on a capability reference another plugin ships (UC30.4)', () => {
		const { 'gitlab.capabilities': capability, ...rest } = documents
		const [entry] = checkReferences(
			[layer('plugin', rest, 'house'), layer('plugin', { 'gitlab.capabilities': capability }, 'cyber-gitlab')],
			{ names: ['project-tracker.blueprints.gitlab.issues'] },
		)
		expect(entry).toMatchObject({ status: 'passed', failures: [] })
	})
})

describe('loading a blueprint (UC31)', () => {
	const setup = () => {
		const root = repo()
		plugins(root, {
			house: {
				'project-tracker.blueprints.interface': blueprintsInterface(),
				'gitlab.capabilities': gitlab,
				'project-tracker.blueprints.gitlab.issues': issues,
			},
		})
		return root
	}
	type Loaded = { content: string; warnings?: { code: string; message: string }[] }

	it('loads with no warning when every needed feature is supported', async () => {
		const root = setup()
		expect(await load(['project-tracker.blueprints.gitlab.issues'], { root, format: 'json' })).toBe(0)
		expect(json<Loaded[]>()[0]?.warnings).toBeUndefined()
	})

	it('warns, naming the section and the feature, for a needed feature the repository marks unsupported (R147)', async () => {
		const root = setup()
		write(
			root,
			'.agents/references/gitlab.capabilities.md',
			'## Epics\n\n**Unsupported.** Our self-hosted tier has no epics.\n',
		)

		expect(await load(['project-tracker.blueprints.gitlab.issues'], { root, format: 'json' })).toBe(0)
		const [entry] = json<Loaded[]>()
		expect(entry?.content).toContain('glab issue create')
		expect(entry?.warnings).toEqual([
			{
				code: 'feature-unsupported',
				message: 'section Create needs Epics, which gitlab.capabilities marks **Unsupported.** here',
			},
		])
	})

	it('reports the same warning from check, which it never fails (R116)', () => {
		const repoLayer = layer('repo', {
			'gitlab.capabilities': '## Epics\n\n**Unsupported.** Our self-hosted tier has no epics.\n',
		})
		const entry = entryOf(
			{
				'project-tracker.blueprints.interface': blueprintsInterface(),
				'gitlab.capabilities': gitlab,
				'project-tracker.blueprints.gitlab.issues': issues,
			},
			'project-tracker.blueprints.gitlab.issues',
			[repoLayer],
		)
		expect(entry).toMatchObject({
			status: 'passed',
			warnings: [expect.objectContaining({ code: 'feature-unsupported' })],
		})
	})

	it('loads a blueprint whose capability reference is missing, with a warning (R148)', async () => {
		const root = repo()
		plugins(root, {
			house: {
				'project-tracker.blueprints.interface': blueprintsInterface(),
				'project-tracker.blueprints.gitlab.issues': issues,
			},
		})
		expect(await load(['project-tracker.blueprints.gitlab.issues'], { root, format: 'json' })).toBe(0)
		const [entry] = json<Loaded[]>()
		expect(entry?.content).toContain('glab issue create')
		expect(entry?.warnings).toEqual([
			{ code: 'interface-check', message: expect.stringContaining('gitlab.capabilities is missing') },
		])
	})
})
