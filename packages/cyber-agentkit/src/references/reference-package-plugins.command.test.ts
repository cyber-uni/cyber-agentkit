import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceListReport, ReferenceSearchReport } from './reference.command.js'
import {
	check,
	customize,
	errors,
	json,
	list,
	load,
	managed,
	packageDependencies,
	plugins,
	repo,
	search,
	stdout,
	tempDir,
	write,
	written,
} from './reference-command.fixtures.js'
import type { ReferenceLoadEntry } from './reference-load.command.js'
import type { ReferenceTrace } from './resolve-reference.js'

const github = '## Track\n\nOpen a GitHub issue.\n'
const jira = '## Track\n\nOpen a Jira ticket.\n'

/** A monorepo using GitHub, whose billing package lists the Jira plugin in its own `package.json`. */
function monorepo(root = repo()): string {
	plugins(root, { github: { tracker: github } })
	packageDependencies(root, 'packages/billing', { 'jira-plugin': { manifest: 'jira', documents: { tracker: jira } } })
	return root
}

type LoadRecord = Exclude<ReferenceLoadEntry, string> & { trace: ReferenceTrace; warnings?: { code: string }[] }

/** The first entry of the last load's JSON answer. */
function loadJson(): LoadRecord {
	const last = stdout.mock.calls.at(-1)?.[0]
	return (JSON.parse(String(last)) as LoadRecord[])[0] as LoadRecord
}

function git(root: string, ...args: string[]): void {
	execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

describe('package plugins (R115, UC21)', () => {
	it("delivers a package plugin's version as a project section for its folder, and keeps the main document", async () => {
		const root = monorepo()

		expect(await load(['tracker'], { root })).toBe(0)
		expect(written()).toBe(`${github}\n<project folder="packages/billing" plugin="jira">\n${jira}</project>\n`)
	})

	it("puts the package plugin's section ahead of the folder's own (R90)", async () => {
		const root = monorepo()
		write(root, 'packages/billing/.agents/references/tracker.md', '## Track\n\nLink the billing board.\n')

		expect(await load(['tracker'], { root, format: 'json' })).toBe(0)
		expect(loadJson().projectSections).toEqual([
			{ folder: 'packages/billing', plugin: 'jira', content: jira },
			{ folder: 'packages/billing', content: '## Track\n\nLink the billing board.\n' },
		])
	})

	it('reports the plugin and its version in the trace (R9)', async () => {
		const root = monorepo()

		expect(await load(['tracker'], { root, format: 'json', trace: true })).toBe(0)
		expect(loadJson().trace.projectSections).toEqual([
			{
				folder: 'packages/billing',
				path: join(root, 'packages/billing/node_modules/jira-plugin/references/tracker.md'),
				file: 'tracker.md',
				frontmatter: {},
				outcome: 'used',
				plugin: 'jira',
				version: '1.0.0',
			},
		])
		expect(await load(['tracker'], { root, trace: true })).toBe(0)
		expect(errors()).toContain('packages/billing (plugin jira@1.0.0)')
	})

	it('adds no section for a plugin the plugin tier already holds (UC21.1)', async () => {
		const root = repo()
		plugins(root, { github: { tracker: github } })
		packageDependencies(root, 'packages/billing', { github: { manifest: 'github', documents: { tracker: jira } } })

		expect(await load(['tracker'], { root })).toBe(0)
		expect(written()).toBe(github)
	})

	it('adds the section only for the outer package when an inner one declares the plugin too (UC21.2)', async () => {
		const root = monorepo()
		packageDependencies(root, 'packages/billing/invoices', {
			'jira-plugin': { manifest: 'jira', documents: { tracker: jira } },
		})

		expect(await load(['tracker'], { root, format: 'json' })).toBe(0)
		expect(loadJson().projectSections).toEqual([{ folder: 'packages/billing', plugin: 'jira', content: jira }])
	})

	it('reads no package.json in a folder git ignores (UC21.3)', async () => {
		const root = tempDir('reference-git-')
		git(root, 'init', '-q')
		write(root, '.gitignore', 'node_modules/\nscratch/\n')
		monorepo(root)
		packageDependencies(root, 'scratch', { 'jira-plugin': { manifest: 'jira', documents: { tracker: jira } } })

		expect(await load(['tracker'], { root, format: 'json' })).toBe(0)
		expect(loadJson().projectSections).toEqual([{ folder: 'packages/billing', plugin: 'jira', content: jira }])
	})

	it('reads no package.json inside a node_modules folder outside git', async () => {
		const root = repo()
		plugins(root, { github: { tracker: github } })
		packageDependencies(root, 'node_modules/wrapper', {
			'jira-plugin': { manifest: 'jira', documents: { tracker: jira } },
		})

		expect(await load(['tracker'], { root })).toBe(0)
		expect(written()).toBe(github)
	})

	it('orders several plugins of one package so each follows the plugins its own extends names, else by name (UC21.4)', async () => {
		const root = repo()
		packageDependencies(root, 'app', {
			house: { manifest: 'house', documents: { tracker: '---\nextends: [jira]\n---\n\n## House\n\nhouse\n' } },
			'jira-plugin': { manifest: 'jira', documents: { tracker: jira } },
			alpha: { manifest: 'alpha', documents: { tracker: '## Alpha\n\nalpha\n' } },
		})

		expect(await load(['tracker'], { root, format: 'json' })).toBe(0)
		expect((loadJson().projectSections ?? []).map(({ plugin }) => plugin)).toEqual(['alpha', 'jira', 'house'])
	})

	it("leaves out the keys a plugin's file carries for the stack, without a warning (UC21.5)", async () => {
		const root = repo()
		packageDependencies(root, 'app', {
			'jira-plugin': {
				manifest: 'jira',
				documents: {
					tracker:
						'---\ndescription: Jira rules.\nmerge: replace\nextends: [github]\ndeclined: [linear]\nimplements: tracker@1\naliases: [issues]\n---\n\n## Track\n\njira\n',
				},
			},
		})

		expect(await load(['tracker'], { root, format: 'json', metadata: true })).toBe(0)
		const entry = loadJson()
		expect(entry.projectSections).toEqual([{ folder: 'app', plugin: 'jira', content: '## Track\n\njira\n' }])
		expect(JSON.stringify(entry)).not.toContain('project-section-key-ignored')
		expect(errors()).not.toContain('is ignored')
	})

	it('neither warns about nor declines a package plugin when the repository picks its stack (R113, R114)', async () => {
		const root = monorepo()

		expect(await customize('tracker', { root, extends: ['github'] })).toBe(0)
		expect(readFileSync(join(root, '.agents/references/tracker.md'), 'utf8')).toBe('---\nextends: [github]\n---\n')
		stdout.mockClear()
		expect(await load(['tracker'], { root, format: 'json' })).toBe(0)
		const entry = loadJson()
		expect(entry.projectSections).toEqual([{ folder: 'packages/billing', plugin: 'jira', content: jira }])
		expect(JSON.stringify(entry)).not.toContain('plugin-not-selected')
	})

	it('adds nothing for a declared package that is not a plugin, or a plugin without the name (UC21.6)', async () => {
		const root = repo()
		packageDependencies(root, 'app', {
			lodash: { documents: { tracker: jira } },
			'jira-plugin': { manifest: 'jira', documents: { other: jira } },
		})

		expect(await load(['tracker'], { root, format: 'json' })).toBe(0)
		expect(loadJson().status).toBe('missing')
	})

	it('applies the managed contribution over it, and a managed replace drops it (K27)', async () => {
		const root = monorepo()
		managed({ tracker: '## Track\n\nmanaged\n' })

		expect(await load(['tracker'], { root, format: 'json' })).toBe(0)
		expect(loadJson().projectSections).toEqual([
			{ folder: 'packages/billing', plugin: 'jira', content: '## Track\n\nmanaged\n' },
		])

		managed({ tracker: '---\nmerge: replace\n---\n\n## Track\n\nonly managed\n' })
		expect(await load(['tracker'], { root, format: 'json', trace: true })).toBe(0)
		const entry = loadJson()
		expect(entry.projectSections ?? []).toEqual([])
		expect(entry.trace.projectSections[0]?.outcome).toMatch(/^shadowed by /)
	})

	it('raises no hidden-file warning for a package plugin a managed replace drops', async () => {
		const root = monorepo()
		managed({ tracker: '---\nmerge: replace\n---\n\n## Track\n\nonly managed\n' })

		expect(await check(['tracker'], { root })).toBe(0)
		expect(written()).not.toContain('jira-plugin')
	})

	it('lists and searches a name only a package plugin holds, the match naming its folder and plugin (R16, R17)', async () => {
		const root = repo()
		packageDependencies(root, 'app', { 'jira-plugin': { manifest: 'jira', documents: { tracker: jira } } })

		expect(await list({ root })).toBe(0)
		expect(json<ReferenceListReport>().references.map(({ name }) => name)).toEqual(['tracker'])
		stdout.mockClear()
		expect(await list({ root, trace: true })).toBe(0)
		expect(json<ReferenceListReport>().layers).toContainEqual(
			expect.objectContaining({ tier: 'project', kind: 'project-section', folder: 'app', plugin: 'jira' }),
		)
		stdout.mockClear()
		expect(await search('jira', { root, trace: true })).toBe(0)
		expect(json<ReferenceSearchReport>().references).toEqual([
			{ name: 'tracker', match: 'body', folder: 'app', tier: 'project', plugin: 'jira' },
		])
	})
})

describe('customize in a package folder (R84, UC21.7)', () => {
	const ask = (root: string) => write(root, 'request.md', 'Name the billing board.\n')
	const draft = (root: string) => write(root, 'draft.md', '## Track\n\nUse the billing board.\n')

	it("gives a folder target the package plugin's section for its own folder", async () => {
		const root = monorepo()

		expect(await customize('tracker', { root, in: join(root, 'packages/billing'), base: true })).toBe(0)
		expect(written()).toBe(`${github}\n<project folder="packages/billing" plugin="jira">\n${jira}</project>\n`)
	})

	it('records the package plugin as a source, and the section goes stale when it changes', async () => {
		const root = monorepo()
		const target = join(root, 'packages/billing/.agents/references/tracker.md')

		expect(
			await customize('tracker', {
				root,
				in: join(root, 'packages/billing'),
				request: ask(root),
				body: draft(root),
			}),
		).toBe(0)
		expect(readFileSync(target, 'utf8')).toMatch(
			/^---\nsources:\n {2}- plugin: github\n {4}version: 1\.0\.0\n {2}- plugin: jira\n {4}version: 1\.0\.0\n/,
		)

		packageDependencies(root, 'packages/billing', {
			'jira-plugin': { manifest: 'jira', documents: { tracker: jira }, version: '2.0.0' },
		})
		stdout.mockClear()
		expect(await load(['tracker'], { root, format: 'json', trace: true })).toBe(0)
		const entry = loadJson()
		expect(entry.trace.projectSections.at(-1)?.outcome).toBe('stale')
		expect(JSON.stringify(entry)).toContain('reference-stale')
	})
})
