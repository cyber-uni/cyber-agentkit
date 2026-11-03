import { describe, expect, it } from 'vitest'
import type { ReferenceListReport } from './reference.command.js'
import { errors, fakeHome, json, list, load, plugins, repo, write, written } from './reference-command.fixtures.js'
import type { ReferenceTrace } from './resolve-reference.js'

const generated = (plugin: string, version: string) =>
	`---\ndescription: House style\nextends: [${plugin}]\nsources:\n  - plugin: ${plugin}\n    version: ${version}\nrequest: |\n  Keep it short.\n  No jargon.\n---\n\n## Style\n\nShort lines.\n`

/** The fixture's dependency plugins are at version 1.0.0, from their `package.json`. */
function stale(): string {
	const root = repo()
	plugins(root, { 'style-kit': { name: '## Style\n\nLong lines.\n' } })
	write(root, '.agents/references/name.md', generated('style-kit', '0.9.0'))
	return root
}

describe('a stale generated document at load (R101, UC1.14)', () => {
	it('is still loaded, with a reference-stale warning on stderr naming the plugin and Customize mode', async () => {
		const root = stale()

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe('## Style\n\nShort lines.\n')
		expect(errors()).toMatch(
			/warning: reference-stale: repo .*name\.md: it is stale: plugin style-kit is 1\.0\.0, recorded 0\.9\.0\. Customize mode revises "name" from its recorded request/,
		)
	})

	it('prints each source with its recorded and installed versions, and the request, in the text trace (R46)', async () => {
		const root = stale()

		expect(await load(['name'], { root, trace: true })).toBe(0)
		const trace = errors()
		expect(trace).toMatch(/ {2}repo .*name\.md: stale; patch from default/)
		expect(trace).toContain('    source plugin style-kit: recorded 0.9.0, installed 1.0.0 (changed)\n')
		expect(trace).toContain('    request:\n      Keep it short.\n      No jargon.\n')
	})

	it('gives each source and the request in the structured trace, and leaves them out of metadata (R38, UC8)', async () => {
		const root = stale()

		expect(await load(['name'], { root, format: 'json', metadata: true, trace: true })).toBe(0)
		const [entry] = json<{ metadata: Record<string, unknown>; warnings: { code: string }[]; trace: ReferenceTrace }[]>()
		expect(entry?.metadata).toEqual({ description: 'House style' })
		expect(entry?.warnings.map(({ code }) => code)).toEqual(['reference-stale'])
		expect(entry?.trace.layers.find(({ tier }) => tier === 'repo')).toMatchObject({
			outcome: 'stale',
			sources: [{ plugin: 'style-kit', recorded: '0.9.0', installed: '1.0.0', status: 'changed' }],
			request: 'Keep it short.\nNo jargon.\n',
		})
	})

	it('is not stale when the recorded version matches the installed one', async () => {
		const root = repo()
		plugins(root, { 'style-kit': { name: '## Style\n\nLong lines.\n' } })
		write(root, '.agents/references/name.md', generated('style-kit', '1.0.0'))

		expect(await load(['name'], { root })).toBe(0)
		expect(errors()).toBe('')
	})

	it("compares a user document only to the harness's enabled plugins: a package.json plugin is gone for it (R101, C6)", async () => {
		const root = repo()
		plugins(root, { 'style-kit': { name: '## Style\n\nLong lines.\n' } })
		write(fakeHome.value, '.agents/references/name.md', generated('style-kit', '1.0.0'))

		expect(await load(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.layers.find(({ tier }) => tier === 'user')).toMatchObject({
			outcome: 'stale',
			sources: [{ plugin: 'style-kit', recorded: '1.0.0', status: 'missing' }],
		})
	})

	it('marks a generated document by its kind in list --trace, with its stale outcome', async () => {
		const root = stale()

		expect(await list({ root, trace: true })).toBe(0)
		expect(json<ReferenceListReport>().layers?.find(({ tier }) => tier === 'repo')).toMatchObject({
			outcome: 'stale',
			kind: 'generated',
		})
	})
})
