import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer } from '../references/reference-layers.js'
import { shippedSandbox } from './skill-design.fixtures.js'
import {
	parseSandbox,
	resolveTestSandbox,
	sandboxLabel,
	sandboxReferenceName,
	shippedReferences,
} from './test-sandbox.js'

/** A tier holding the given sandbox documents, each `<name suffix>: <yaml>` ('' for the name itself). */
function tier(
	tier: ReferenceLayer['tier'],
	files: Record<string, string>,
	extra: Partial<ReferenceLayer> = {},
): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), `sandbox-${tier}-`))
	for (const [suffix, text] of Object.entries(files))
		writeFileSync(join(dir, `${sandboxReferenceName}${suffix ? `.${suffix}` : ''}.yaml`), text)
	return { tier, dir, ...extra }
}

/** This package's own references folder, as the plugin tier reads it. */
const own = (): ReferenceLayer => {
	const dir = mkdtempSync(join(tmpdir(), 'sandbox-own-'))
	cpSync(fileURLToPath(new URL('../../references', import.meta.url)), dir, { recursive: true })
	return { tier: 'plugin', dir, plugin: 'cyber-agentkit' }
}
/** Resolves with no shipped fallback, so each test sees only the tiers it gives. */
const resolve = (layers: ReferenceLayer[], flag?: string) => resolveTestSandbox({ layers, harnesses: [] }, flag, null)
const claudeCode = shippedSandbox('claude-code')
const folderOnly = shippedSandbox('folder-only')

describe('the shipped sandbox templates (#302)', () => {
	it('sets every setting in each template', () => {
		expect(resolve([own()], 'claude-code')).toMatchObject({ settings: claudeCode, templates: ['claude-code'] })
		expect(resolve([own()], 'folder-only')).toMatchObject({ settings: folderOnly, templates: ['folder-only'] })
	})

	it('runs claude-code in both sandboxes, and folder-only in neither, with the file-tool limits and the hook on', () => {
		expect(claudeCode.shell).toMatchObject({ sandbox: true, network: 'case-hosts', hideHome: true })
		expect(claudeCode.scripts).toEqual({ sandbox: true, network: 'closed' })
		expect(folderOnly.shell.sandbox).toBe(false)
		expect(folderOnly.scripts.sandbox).toBe(false)
		for (const settings of [claudeCode, folderOnly]) {
			expect(settings.fileTools).toEqual({
				blockReadsOutsideWorkingDirectories: true,
				blockWritesOutsideWorkingDirectories: true,
			})
			expect(settings.hook).toBe(true)
		}
		expect(sandboxLabel(claudeCode)).toBeUndefined()
		expect(sandboxLabel(folderOnly)).toBe('none')
	})
})

describe('parseSandbox', () => {
	it('reads extends and the settings a document sets', () => {
		expect(parseSandbox('extends: skill-design.test.sandbox.folder-only\nshell:\n  hideHome: true\n')).toEqual({
			extends: 'skill-design.test.sandbox.folder-only',
			settings: { shell: { hideHome: true } },
		})
	})

	it('refuses an unknown key, a bad value, and an extends outside the templates, naming the key', () => {
		expect(parseSandbox('shel: {}\n')).toEqual({ problem: expect.stringContaining('unknown key shel') })
		expect(parseSandbox('shell:\n  sandbx: true\n')).toEqual({
			problem: expect.stringContaining('unknown key shell.sandbx'),
		})
		expect(parseSandbox('shell:\n  sandbox: "no"\n')).toEqual({
			problem: expect.stringContaining('shell.sandbox must be true or false'),
		})
		expect(parseSandbox('scripts:\n  network: wide\n')).toEqual({
			problem: expect.stringContaining('scripts.network must be closed or open'),
		})
		expect(parseSandbox('hook: 1\n')).toEqual({ problem: expect.stringContaining('hook must be true or false') })
		expect(parseSandbox('extends: house-style\n')).toEqual({ problem: expect.stringContaining('extends must name') })
		expect(parseSandbox('- a\n')).toEqual({ problem: expect.stringContaining('mapping') })
		expect(parseSandbox('shell: [\n')).toEqual({ problem: expect.stringContaining('not YAML') })
	})
})

describe('resolveTestSandbox (#302)', () => {
	it('runs in the claude-code template when no tier chooses, through the plugin document that extends it', () => {
		expect(resolve([own()])).toEqual({
			settings: claudeCode,
			templates: ['claude-code'],
			from: 'plugin',
			warnings: [],
		})
	})

	it('takes the template a managed, repo, or user document extends', () => {
		for (const name of ['managed', 'repo', 'user'] as const)
			expect(resolve([tier(name, { '': 'extends: skill-design.test.sandbox.folder-only\n' }), own()])).toMatchObject({
				settings: folderOnly,
				templates: ['folder-only'],
				from: name,
			})
	})

	it('lays a document’s own settings over the template it extends, key by key, the file-tool limits included', () => {
		const chosen = resolve([
			tier('user', {
				'': 'extends: skill-design.test.sandbox.folder-only\nscripts:\n  sandbox: true\n  network: closed\nfileTools:\n  blockReadsOutsideWorkingDirectories: false\n',
			}),
			own(),
		])
		expect(chosen).toMatchObject({
			settings: {
				shell: folderOnly.shell,
				scripts: { sandbox: true, network: 'closed' },
				fileTools: { blockReadsOutsideWorkingDirectories: false, blockWritesOutsideWorkingDirectories: true },
				hook: true,
			},
		})
		expect('settings' in chosen && sandboxLabel(chosen.settings)).toBe('scripts-only')
	})

	it('lets a tier define a template of its own that --sandbox names', () => {
		const repo = tier('repo', { strict: 'extends: skill-design.test.sandbox.claude-code\nhook: false\n' })
		expect(resolve([repo, own()], 'strict')).toMatchObject({
			settings: { ...claudeCode, hook: false },
			templates: ['strict', 'claude-code'],
			from: 'flag',
		})
	})

	it('lets --sandbox win over every tier, with default naming claude-code', () => {
		const user = tier('user', { '': 'extends: skill-design.test.sandbox.folder-only\n' })
		expect(resolve([user, own()], 'default')).toMatchObject({ settings: claudeCode, from: 'flag' })
		expect(
			resolve([tier('managed', { '': 'extends: skill-design.test.sandbox.claude-code\n' }), own()], 'folder-only'),
		).toMatchObject({
			settings: folderOnly,
		})
	})

	it("never reads another plugin's copy, and says so", () => {
		const loose = tier(
			'plugin',
			{ '': 'extends: skill-design.test.sandbox.folder-only\n', 'claude-code': 'hook: false\n' },
			{ plugin: 'loose' },
		)
		const chosen = resolve([loose, own()])
		expect(chosen).toMatchObject({ settings: claudeCode, from: 'plugin' })
		expect('warnings' in chosen && chosen.warnings).toEqual([
			expect.stringContaining('sandbox-not-chosen: skill-design.test.sandbox from plugin loose'),
			expect.stringContaining('sandbox-not-chosen: skill-design.test.sandbox.claude-code from plugin loose'),
		])
	})

	it('never reads a skill’s default or a project section', () => {
		const skill = tier('default', { '': 'extends: skill-design.test.sandbox.folder-only\n' }, { skill: 'x' })
		const project = tier('project', { '': 'extends: skill-design.test.sandbox.folder-only\n' })
		expect(resolve([project, own(), skill])).toMatchObject({ settings: claudeCode })
	})

	it('refuses, rather than guess, an unknown template, a bad document, a cycle, and incomplete settings', () => {
		expect(resolve([own()], 'nope')).toMatchObject({
			code: 'unknown-sandbox',
			problem: expect.stringContaining('no sandbox template nope'),
		})
		expect(resolve([own()], 'Bad/Name')).toMatchObject({ code: 'unknown-sandbox' })
		expect(resolve([tier('repo', { '': 'shell:\n  sandbox: off\n' }), own()])).toMatchObject({
			code: 'sandbox-invalid',
		})
		expect(
			resolve([
				tier('repo', { '': 'extends: skill-design.test.sandbox.a\n', a: 'extends: skill-design.test.sandbox.a\n' }),
				own(),
			]),
		).toMatchObject({
			code: 'sandbox-invalid',
			problem: expect.stringContaining('cycle'),
		})
		expect(resolve([tier('repo', { '': 'hook: true\n' }), own()])).toMatchObject({
			code: 'sandbox-invalid',
			problem: expect.stringContaining('it sets no shell'),
		})
		expect(resolve([tier('repo', { '': 'extends: skill-design.test.sandbox.gone\n' }), own()])).toMatchObject({
			code: 'sandbox-missing',
		})
		expect(resolve([])).toMatchObject({ code: 'sandbox-missing' })
	})

	it('falls back to the templates this package ships when no tier gives the plugin copy, as for a library caller', () => {
		expect(shippedReferences()).toBe(fileURLToPath(new URL('../../references', import.meta.url)))
		expect(resolveTestSandbox({ layers: [], harnesses: [] }, undefined)).toEqual({
			settings: claudeCode,
			templates: ['claude-code'],
			from: 'plugin',
			warnings: [],
		})
		expect(resolveTestSandbox({ layers: [], harnesses: [] }, 'folder-only')).toMatchObject({ settings: folderOnly })
		// A tier above still chooses, over the shipped copy.
		const user = tier('user', { '': 'extends: skill-design.test.sandbox.folder-only\n' })
		expect(resolveTestSandbox({ layers: [user], harnesses: [] }, undefined)).toMatchObject({
			settings: folderOnly,
			from: 'user',
		})
	})

	it('refuses an open network inside a sandbox, which no sandbox is set up to hold', () => {
		const shell = tier('repo', { '': 'extends: skill-design.test.sandbox.claude-code\nshell:\n  network: open\n' })
		expect(resolve([shell, own()])).toMatchObject({
			code: 'sandbox-invalid',
			problem: expect.stringContaining('shell.network open'),
		})
		const scripts = tier('repo', { '': 'extends: skill-design.test.sandbox.claude-code\nscripts:\n  network: open\n' })
		expect(resolve([scripts, own()])).toMatchObject({
			code: 'sandbox-invalid',
			problem: expect.stringContaining('scripts.network open'),
		})
	})
})
