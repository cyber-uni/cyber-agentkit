import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer } from './reference-layers.js'
import { resolveReference } from './resolve-reference.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string> = {}, plugin?: string): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'extends-reference-'))
	for (const [file, content] of Object.entries(documents)) {
		mkdirSync(dirname(join(dir, file)), { recursive: true })
		writeFileSync(join(dir, file), content)
	}
	return plugin === undefined ? { tier, dir } : { tier, dir, plugin }
}

const md = (extendsLine: string, body: string) => `---\n${extendsLine}\n---\n\n${body}\n`
const codes = (r: ReturnType<typeof resolveReference>) => r.warnings.map(({ code }) => code)

describe('an extends step that names another reference', () => {
	it('brings the named reference from the plugin under the written one', () => {
		const resolved = resolveReference('A', [
			layer('user', { 'A.md': md('extends: [acme/B]', '## Own\n\nmine') }),
			layer('plugin', { 'A.md': '## Own\n\nplugin A\n', 'B.md': '## Base\n\nbase\n' }, 'acme'),
		])
		expect(resolved.status).toBe('found')
		expect(resolved.content).toContain('base')
		expect(resolved.content).toContain('mine')
		expect(resolved.content).not.toContain('plugin A')
		expect(resolved.trace.stack).toEqual(['acme/B'])
	})

	it("follows the named file's own bare steps under that name", () => {
		const resolved = resolveReference('A', [
			layer('user', { 'A.md': md('extends: [acme/B]', '## Own\n\nmine') }),
			layer('plugin', { 'B.md': md('extends: [base]', '## Mid\n\nmid') }, 'acme'),
			layer('plugin', { 'B.md': '## Root\n\nroot\n', 'A.md': '## Wrong\n\nwrong\n' }, 'base'),
		])
		expect(resolved.content).toContain('root')
		expect(resolved.content).not.toContain('wrong')
		expect(resolved.trace.stack).toEqual(['base/B', 'acme/B'])
	})

	it('reports a cycle in a written extends', () => {
		const resolved = resolveReference('A', [
			layer('user', { 'A.md': md('extends: [acme/B]', '## Own\n\nmine') }),
			layer('plugin', { 'B.md': md('extends: [base]', 'x') }, 'acme'),
			layer('plugin', { 'B.md': md('extends: [acme]', 'y') }, 'base'),
		])
		expect(resolved).toMatchObject({ status: 'ambiguous', cause: 'cycle' })
		expect(resolved.message).toContain('acme/B → base/B → acme/B')
	})

	it('ignores a step naming itself, with a warning', () => {
		const resolved = resolveReference('A', [
			layer('plugin', { 'A.md': md('extends: [acme/A]', '## Own\n\nplugin') }, 'acme'),
		])
		expect(codes(resolved)).toContain('extends-self')
		expect(resolved.status).toBe('found')
	})

	it('applies a diamond base once', () => {
		const resolved = resolveReference('A', [
			layer('user', { 'A.md': md('extends: [acme/B, other/B]', '## Own\n\nmine') }),
			layer('plugin', { 'B.md': md('extends: [base]', '## Left\n\nleft') }, 'acme'),
			layer('plugin', { 'B.md': md('extends: [base]', '## Right\n\nright') }, 'other'),
			layer('plugin', { 'B.md': '## Base\n\nbase\n' }, 'base'),
		])
		expect(resolved.status).toBe('found')
		expect(resolved.trace.stack).toEqual(['base/B', 'acme/B', 'other/B'])
	})

	it("skips a plugin's own step that picks another reference", () => {
		const resolved = resolveReference('A', [
			layer('plugin', { 'A.md': md('extends: [other/B]', '## Own\n\nplugin A') }, 'acme'),
			layer('plugin', { 'B.md': '## Base\n\nbase\n' }, 'other'),
		])
		expect(codes(resolved)).toContain('extends-step-not-allowed')
		expect(resolved.content).not.toContain('base')
	})

	it('treats a missing named reference as a missing step', () => {
		const resolved = resolveReference('A', [
			layer('user', { 'A.md': md('extends: [acme/Gone]', '## Own\n\nmine') }),
			layer('plugin', { 'A.md': '## Own\n\nplugin\n' }, 'acme'),
		])
		expect(codes(resolved)).toContain('extends-step-missing')
	})
})

describe('data references that extend', () => {
	const sidecar = (extendsLine: string) => `---\n${extendsLine}\n---\n`
	it('lays a user file over a named reference key by key', () => {
		const plugin = layer(
			'plugin',
			{ 'base.yaml': 'shell:\n  sandbox: true\n  network: closed\nlist: [a, b]\ngone: 1\n' },
			'acme',
		)
		const user = layer('user', {
			'cfg.yaml': 'shell:\n  network: open\nlist: [x]\ngone: null\n',
			'cfg.meta.md': sidecar('extends: [acme/base]'),
		})
		const resolved = resolveReference('cfg', [user, plugin])
		expect(resolved).toMatchObject({ status: 'found', format: 'yaml' })
		expect(resolved.content).toBe('shell:\n  sandbox: true\n  network: open\nlist:\n  - x\n')
	})

	it('merges JSON the same way', () => {
		const plugin = layer('plugin', { 'base.json': '{"a":{"b":1,"c":2},"d":[1]}' }, 'acme')
		const user = layer('user', {
			'cfg.json': '{"a":{"b":9},"d":[2,3]}',
			'cfg.meta.md': sidecar('extends: [acme/base]'),
		})
		const resolved = resolveReference('cfg', [user, plugin])
		expect(JSON.parse(resolved.content as string)).toEqual({ a: { b: 9, c: 2 }, d: [2, 3] })
	})

	it('answers TOML whole and warns', () => {
		const plugin = layer('plugin', { 'base.toml': 'a = 1\nb = 2\n' }, 'acme')
		const user = layer('user', { 'cfg.toml': 'a = 9\n', 'cfg.meta.md': sidecar('extends: [acme/base]') })
		const resolved = resolveReference('cfg', [user, plugin])
		expect(resolved.content).toBe('a = 9\n')
		expect(codes(resolved)).toContain('data-not-merged')
	})

	it('answers a file that writes no extends whole, as before', () => {
		const plugin = layer('plugin', { 'cfg.yaml': 'a: 1\nb: 2\n' }, 'acme')
		const user = layer('user', { 'cfg.yaml': 'a: 9\n' })
		expect(resolveReference('cfg', [user, plugin]).content).toBe('a: 9\n')
	})
})
