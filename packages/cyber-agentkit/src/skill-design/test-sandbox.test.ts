import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer } from '../references/reference-layers.js'
import { parseSandbox, resolveTestSandbox, sandboxReferenceName } from './test-sandbox.js'

function tier(
	tier: ReferenceLayer['tier'],
	text: string | undefined,
	extra: Partial<ReferenceLayer> = {},
): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), `sandbox-${tier}-`))
	if (text !== undefined) writeFileSync(join(dir, `${sandboxReferenceName}.yaml`), text)
	return { tier, dir, ...extra }
}

/** The package's own reference, which the plugin tier reads. */
const shipped = readFileSync(new URL(`../../references/${sandboxReferenceName}.yaml`, import.meta.url), 'utf8')
const plugin = () => {
	const layer = tier('plugin', shipped, { plugin: 'cyber-agentkit' })
	return layer
}
const resolve = (layers: ReferenceLayer[], flag?: string) => resolveTestSandbox({ layers, harnesses: [] }, flag)

describe('parseSandbox', () => {
	it('reads the template a document names', () => {
		expect(parseSandbox('template: folder-only\n')).toBe('folder-only')
		expect(parseSandbox('# a note\ntemplate: default\n')).toBe('default')
	})

	it('answers a problem for a document that names no known template', () => {
		expect(parseSandbox('template: none\n')).toEqual({ problem: expect.stringContaining('not "none"') })
		expect(parseSandbox('sandbox: off\n')).toEqual({ problem: expect.stringContaining('not null') })
		expect(parseSandbox('template: [\n')).toEqual({ problem: expect.stringContaining('not YAML') })
	})

	it('ships the default template', () => {
		expect(parseSandbox(shipped)).toBe('default')
	})
})

describe('resolveTestSandbox (#302)', () => {
	it('runs in the default sandbox when no tier chooses one', () => {
		expect(resolve([plugin()])).toEqual({ template: 'default', from: 'default', warnings: [] })
		expect(resolve([])).toEqual({ template: 'default', from: 'default', warnings: [] })
	})

	it('takes the template the managed, repo, or user tier names', () => {
		for (const name of ['managed', 'repo', 'user'] as const)
			expect(resolve([tier(name, 'template: folder-only\n'), plugin()])).toMatchObject({
				template: 'folder-only',
				from: name,
			})
	})

	it('lets a higher tier put the default back over a lower one', () => {
		expect(
			resolve([tier('repo', 'template: default\n'), tier('user', 'template: folder-only\n'), plugin()]),
		).toMatchObject({ template: 'default', from: 'repo' })
	})

	it('lets --sandbox win over every tier', () => {
		expect(resolve([tier('managed', 'template: default\n'), plugin()], 'folder-only')).toEqual({
			template: 'folder-only',
			from: 'flag',
			warnings: [],
		})
		expect(resolve([tier('user', 'template: folder-only\n')], 'default')).toMatchObject({ template: 'default' })
	})

	it('never takes a template from a plugin, and says so when one names another', () => {
		const other = tier('plugin', 'template: folder-only\n', { plugin: 'loose' })
		const chosen = resolve([other])
		expect(chosen).toMatchObject({ template: 'default', from: 'default' })
		expect('warnings' in chosen && chosen.warnings).toEqual([expect.stringContaining('sandbox-not-chosen')])
	})

	it('refuses an unknown --sandbox and a tier document it cannot read, rather than guess', () => {
		expect(resolve([plugin()], 'none')).toMatchObject({ code: 'unknown-sandbox' })
		expect(resolve([tier('repo', 'template: off\n'), plugin()])).toMatchObject({ code: 'sandbox-invalid' })
	})
})
