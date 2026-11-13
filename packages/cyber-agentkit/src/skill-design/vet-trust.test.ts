import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer } from '../references/reference-layers.js'
import { isTrusted, readTrustList, trustListName, trustListNames } from './vet-trust.js'

function tier(
	tier: ReferenceLayer['tier'],
	text: string | undefined,
	extra: Partial<ReferenceLayer> = {},
): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), `trust-${tier}-`))
	if (text !== undefined) writeFileSync(join(dir, `${trustListName}.md`), text)
	return { tier, dir, ...extra }
}

const list = (body: string, merge = 'combine') => `---\nmerge: ${merge}\n---\n\n## Trusted publishers\n\n${body}\n`

describe('trustListNames', () => {
	it('reads each list item under the Trusted publishers heading, dropping backticks and the note after the name', () => {
		const text =
			'# Top\n\n- not-this\n\n## Trusted publishers\n\nSome prose.\n\n- `acme`: ours\n* vercel-labs\n- bad/name\n\n## Other\n\n- nope\n'
		expect(trustListNames(text)).toEqual({ names: ['acme', 'vercel-labs'], skipped: ['bad/name'] })
	})
})

describe('readTrustList', () => {
	it('merges every tier that combines into the list, crediting each name to every tier that lists it', () => {
		const managed = tier('managed', list('- acme'))
		const repo = tier('repo', list('- acme\n- cyber-uni'))
		const user = tier('user', list('- solo'))
		const plugin = tier('plugin', '## Trusted publishers\n\nNone by default.\n', { plugin: 'cyber-agentkit' })
		mkdirSync(plugin.dir, { recursive: true })
		const read = readTrustList({ layers: [managed, repo, user, plugin], harnesses: [] }, ['extra'], (path) => path)
		expect(read.warnings).toEqual([])
		const from = Object.fromEntries(read.publishers.map(({ name, from }) => [name, from]))
		expect(from['acme']).toEqual([`managed ${managed.dir}/${trustListName}.md`, `repo ${repo.dir}/${trustListName}.md`])
		expect(from['cyber-uni']).toEqual([`repo ${repo.dir}/${trustListName}.md`])
		expect(from['solo']).toEqual([`user ${user.dir}/${trustListName}.md`])
		expect(from['extra']).toEqual(['--trust'])
	})

	it('drops the names below a tier that patches the section, as the reference tiers compose it', () => {
		const repo = tier('repo', list('- team', 'patch'))
		const user = tier('user', list('- solo'))
		const read = readTrustList({ layers: [repo, user], harnesses: [] }, [], (path) => path)
		expect(read.publishers.map(({ name }) => name)).toEqual(['team'])
	})

	it('trusts only --trust names when no tier holds the list', () => {
		const read = readTrustList({ layers: [tier('repo', undefined)], harnesses: [] }, ['acme'], (path) => path)
		expect(read).toEqual({ publishers: [{ name: 'acme', from: ['--trust'] }], warnings: [] })
	})
})

describe('isTrusted', () => {
	it('compares names without case, and trusts no unknown publisher', () => {
		const publishers = [{ name: 'Acme', from: ['--trust'] }]
		expect(isTrusted(publishers, 'acme')).toBe(true)
		expect(isTrusted(publishers, 'other')).toBe(false)
		expect(isTrusted(publishers, undefined)).toBe(false)
	})
})
