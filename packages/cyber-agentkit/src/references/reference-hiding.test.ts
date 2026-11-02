import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hiddenBy } from './reference-hiding.js'
import type { ReferenceLayer } from './reference-layers.js'
import { resolveReference } from './resolve-reference.js'

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string> = {}): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), 'reference-hiding-'))
	for (const [file, content] of Object.entries(documents)) {
		const path = join(dir, file)
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, content)
	}
	return { tier, dir }
}

function plugin(name: string, documents: Record<string, string> = {}): ReferenceLayer {
	return { ...layer('plugin', documents), plugin: name }
}

const replace = '---\nmerge: replace\n---\n\n## A\n\nmine\n'
const remove = '---\nmerge: remove\n---\n'

function hider(layers: ReferenceLayer[], target: ReferenceLayer): string | undefined {
	const resolved = resolveReference('name', layers)
	return hiddenBy(resolved, target.dir, join(target.dir, 'name.md'))
}

describe('hiddenBy (J6)', () => {
	it('names a stale generated replace above, which is still used (R101)', () => {
		const repo = layer('repo', {
			'name.md': '---\nmerge: replace\nsources:\n  - plugin: gone-kit\n    version: 1.0.0\n---\n\n## A\n\nmine\n',
		})
		const user = layer('user')

		expect(hider([repo, user], user)).toBe(`repo ${join(repo.dir, 'name.md')} (replace)`)
	})

	it('names the nearest replace or remove above a tier file, not the highest', () => {
		const managed = layer('managed', { 'name.md': replace })
		const repo = layer('repo', { 'name.md': remove })
		const user = layer('user')

		expect(hider([managed, repo, user], user)).toBe(`repo ${join(repo.dir, 'name.md')} (remove)`)
	})

	it('names a tier above a plugin on the stack, nearest first', () => {
		const repo = layer('repo', { 'name.md': '---\nextends: [a, b]\n---\n' })
		const user = layer('user', { 'name.md': replace })
		const a = plugin('a', { 'name.md': '## A\n\na\n' })
		const b = plugin('b', { 'name.md': '## A\n\nb\n' })

		expect(hider([repo, user, a, b], a)).toBe(`user ${join(user.dir, 'name.md')} (replace)`)
	})

	it('names a plugin higher on the stack before any tier', () => {
		const repo = layer('repo', { 'name.md': '---\nextends: [a, b]\n---\n' })
		const user = layer('user', { 'name.md': '## A\n\nuser\n' })
		const a = plugin('a', { 'name.md': '## A\n\na\n' })
		const b = plugin('b', { 'name.md': replace })

		expect(hider([repo, user, a, b], a)).toBe(`plugin b ${join(b.dir, 'name.md')} (replace)`)
	})

	it('finds nothing for a replace with no body, a patch, or a contribution below', () => {
		const repo = layer('repo', { 'name.md': '---\nmerge: replace\nextends: []\n---\n' })
		const user = layer('user', { 'name.md': '## A\n\npatch\n' })
		const below = layer('plugin', { 'name.md': replace })
		const top = layer('managed')

		expect(hider([top, repo, user, { ...below, plugin: 'a' }], user)).toBeUndefined()
		expect(hider([top, repo, user, { ...below, plugin: 'a' }], top)).toBeUndefined()
	})

	it('finds nothing for a folder the name does not read', () => {
		const repo = layer('repo', { 'name.md': remove })

		expect(hider([repo], layer('user'))).toBeUndefined()
	})
})
