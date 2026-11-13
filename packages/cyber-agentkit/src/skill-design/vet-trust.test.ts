import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer } from '../references/reference-layers.js'
import { parseVetSource, type VetSource } from './vet-source.js'
import {
	covers,
	parseTrustEntry,
	readTrustList,
	type TrustEntry,
	trustListEntries,
	trustListName,
} from './vet-trust.js'

function tier(
	tier: ReferenceLayer['tier'],
	text: string | undefined,
	extra: Partial<ReferenceLayer> = {},
): ReferenceLayer {
	const dir = mkdtempSync(join(tmpdir(), `trust-${tier}-`))
	if (text !== undefined) writeFileSync(join(dir, `${trustListName}.md`), text)
	return { tier, dir, ...extra }
}

const list = (body: string, merge = 'combine') => `---\nmerge: ${merge}\n---\n\n## Trusted sources\n\n${body}\n`

const source = (text: string, overrides: { ref?: string; path?: string } = {}) =>
	parseVetSource(text, overrides, { cwd: '/work', home: '/home/me' }) as VetSource
const entry = (text: string) => parseTrustEntry(text) as TrustEntry

describe('parseTrustEntry', () => {
	it('reads the short forms and the mapping with Claude Code allowlist keys', () => {
		expect(parseTrustEntry('acme/skills')).toEqual({ source: 'github', repo: 'acme/skills' })
		expect(parseTrustEntry('`acme/*`')).toEqual({ source: 'github', repo: 'acme/*' })
		expect(parseTrustEntry('https://gitlab.com/acme/skills.git')).toEqual({
			source: 'git',
			url: 'https://gitlab.com/acme/skills.git',
		})
		expect(parseTrustEntry('/opt/skills')).toEqual({ source: 'directory', path: '/opt/skills' })
		expect(parseTrustEntry('{ source: github, repo: acme/skills, ref: v1, path: notes }')).toEqual({
			source: 'github',
			repo: 'acme/skills',
			ref: 'v1',
			path: 'notes',
		})
	})

	it('refuses a bare owner, a relative folder, and a mapping it cannot read', () => {
		expect(parseTrustEntry('acme')).toMatchObject({ problem: expect.stringContaining('acme/*') })
		expect(parseTrustEntry('./skills')).toHaveProperty('problem')
		expect(parseTrustEntry('{ source: directory, path: rel }')).toHaveProperty('problem')
		expect(parseTrustEntry('{ source: npm, package: x }')).toHaveProperty('problem')
		expect(parseTrustEntry('tools-*/x')).toHaveProperty('problem')
	})
})

describe('trustListEntries', () => {
	it('reads each list item under the Trusted sources heading, dropping the note after the entry', () => {
		const text =
			'# Top\n\n- not/this\n\n## Trusted sources\n\nProse.\n\n- `acme/*`: ours\n* { source: github, repo: x/y, ref: v1 } pinned\n- acme\n\n## Other\n\n- no/pe\n'
		const read = trustListEntries(text)
		expect(read.entries).toEqual([
			{ source: 'github', repo: 'acme/*' },
			{ source: 'github', repo: 'x/y', ref: 'v1' },
		])
		expect(read.problems).toHaveLength(1)
	})
})

describe('covers', () => {
	it('matches a GitHub repository exactly: ref and path equal or absent on both sides', () => {
		expect(covers(entry('acme/skills'), source('acme/skills'))).toBe(true)
		expect(covers(entry('acme/skills'), source('acme/skills/release-notes'))).toBe(false)
		expect(covers(entry('acme/skills'), source('acme/skills', { ref: 'main' }))).toBe(false)
		expect(covers(entry('Acme/skills'), source('acme/skills'))).toBe(false)
		const pinned = entry('{ source: github, repo: acme/skills, ref: v1, path: notes }')
		expect(covers(pinned, source('https://github.com/acme/skills/tree/v1/notes'))).toBe(true)
	})

	it('lets an owner wildcard cover any path in any of its repositories, with the ref still exact', () => {
		expect(covers(entry('acme/*'), source('acme/tools/a/b'))).toBe(true)
		expect(covers(entry('acme/*'), source('acme/tools', { ref: 'v1' }))).toBe(false)
		expect(covers(entry('acme/*'), source('other/tools'))).toBe(false)
	})

	it('matches a git URL exactly, and never against a GitHub source', () => {
		expect(covers(entry('https://gitlab.com/acme/skills.git'), source('https://gitlab.com/acme/skills.git'))).toBe(true)
		expect(covers(entry('https://gitlab.com/acme/skills.git'), source('https://gitlab.com/acme/skills'))).toBe(false)
		expect(covers(entry('https://github.com/acme/skills'), source('https://github.com/acme/skills'))).toBe(false)
	})

	it('matches a local folder by its absolute path exactly', () => {
		expect(covers(entry('/work/vendor/skills'), source('./vendor/skills'))).toBe(true)
		expect(covers(entry('/work/vendor'), source('./vendor/skills'))).toBe(false)
		expect(covers(entry('/home/me/skills'), source('~/skills'))).toBe(true)
		expect(covers(entry('acme/*'), source('./acme/skills'))).toBe(false)
	})
})

describe('readTrustList', () => {
	it('merges every tier that combines into the list, crediting each entry to every tier that lists it', () => {
		const managed = tier('managed', list('- acme/*'))
		const repo = tier('repo', list('- acme/*\n- cyber-uni/skills'))
		const user = tier('user', list('- /opt/skills'))
		const plugin = tier('plugin', '## Trusted sources\n\nNone by default.\n', { plugin: 'cyber-agentkit' })
		const read = readTrustList({ layers: [managed, repo, user, plugin], harnesses: [] }, ['x/y'], (path) => path)
		expect(read.warnings).toEqual([])
		const from = Object.fromEntries(read.sources.map(({ label, from }) => [label, from]))
		expect(from['acme/*']).toEqual([
			`managed ${managed.dir}/${trustListName}.md`,
			`repo ${repo.dir}/${trustListName}.md`,
		])
		expect(from['cyber-uni/skills']).toEqual([`repo ${repo.dir}/${trustListName}.md`])
		expect(from['/opt/skills']).toEqual([`user ${user.dir}/${trustListName}.md`])
		expect(from['x/y']).toEqual(['--trust'])
	})

	it('drops the entries below a tier that patches the section, as the reference tiers compose it', () => {
		const repo = tier('repo', list('- team/*', 'patch'))
		const user = tier('user', list('- solo/*'))
		const read = readTrustList({ layers: [repo, user], harnesses: [] }, [], (path) => path)
		expect(read.sources.map(({ label }) => label)).toEqual(['team/*'])
	})

	it('trusts only --trust entries when no tier holds the list, and warns on one it cannot read', () => {
		const read = readTrustList({ layers: [tier('repo', undefined)], harnesses: [] }, ['acme/*', 'acme'], (p) => p)
		expect(read.sources).toEqual([{ entry: { source: 'github', repo: 'acme/*' }, label: 'acme/*', from: ['--trust'] }])
		expect(read.warnings).toEqual([expect.stringContaining('trust-entry-invalid: --trust acme')])
	})
})
