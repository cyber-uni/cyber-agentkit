import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer } from './reference-layers.js'
import { whereReference } from './reference-where.js'

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), 'reference-where-'))
}

function write(dir: string, file: string, content: string): void {
	mkdirSync(dir, { recursive: true })
	writeFileSync(join(dir, file), content)
}

function setup() {
	const root = tempDir()
	const home = tempDir()
	const plugin = tempDir()
	const layers: ReferenceLayer[] = [
		{ tier: 'repo', dir: join(root, '.agents', 'references') },
		{ tier: 'user', dir: join(home, '.agents', 'references') },
		{ tier: 'plugin', dir: plugin, plugin: 'a' },
	]
	return { root, home, plugin, layers }
}

describe('whereReference', () => {
	it('gives the repo and user files, who each reaches, the main heading paths, and the stack used (R57)', () => {
		const { root, home, plugin, layers } = setup()
		write(plugin, 'guide.md', '## Setup\n\n### Steps\n\n## Usage\n')
		write(join(home, '.agents', 'references'), 'guide.md', '## Extra\n')

		const report = whereReference('guide', layers, { root })

		expect(report.status).toBe('found')
		expect(report.files).toEqual([
			{
				scope: 'repo',
				path: join('.agents', 'references', 'guide.md'),
				reaches: 'everyone working in this repository',
			},
			{
				scope: 'user',
				path: join(home, '.agents', 'references', 'guide.md'),
				reaches: 'only you, in every repository',
			},
		])
		expect(report.headings).toEqual(['Setup', 'Setup > Steps', 'Usage', 'Extra'])
		expect(report.used).toEqual(['a'])
		expect(report.layers.map(({ tier }) => tier)).toEqual(['repo', 'user', 'plugin'])
	})

	it('gives the options and the files a selection goes to on an ambiguous name, never the plugins (UC2.5, UC2.6)', () => {
		const { root, layers } = setup()
		const other = tempDir()
		write(layers[2]?.dir as string, 'guide.md', '## A\n')
		write(other, 'guide.md', '## B\n')

		const report = whereReference('guide', [...layers, { tier: 'plugin', dir: other, plugin: 'b' }], { root })

		expect(report.status).toBe('ambiguous')
		expect(report.options).toEqual(['a/guide', 'b/guide'])
		expect(report.files.map(({ scope }) => scope)).toEqual(['repo', 'user'])
		expect(report.headings).toEqual([])
	})

	it('marks a file hidden by a replace above it, file there or not, naming the contribution (UC2.10)', () => {
		const { root, layers } = setup()
		write(join(root, '.agents', 'references'), 'guide.md', '---\nmerge: replace\n---\n\n## Repo\n')

		const report = whereReference('guide', layers, { root })

		expect(report.files[0]?.hiddenBy).toBeUndefined()
		expect(report.files[1]).toMatchObject({
			scope: 'user',
			hiddenBy: `repo ${join(root, '.agents', 'references', 'guide.md')} (replace)`,
		})
	})

	it('gives the path of the file that answers in another form', () => {
		const { root, layers } = setup()
		write(join(root, '.agents', 'references', 'guide'), 'README.md', '## Folder\n')

		expect(whereReference('guide', layers, { root }).files[0]?.path).toBe(
			join('.agents', 'references', 'guide', 'README.md'),
		)
	})

	it('gives the --in folder’s project section file, and refuses a folder not below the root', () => {
		const { root, layers } = setup()

		const report = whereReference('guide', layers, { root, in: join(root, 'packages', 'app') })
		expect(report.files[2]).toEqual({
			scope: 'packages/app',
			path: join('packages', 'app', '.agents', 'references', 'guide.md'),
			reaches: 'everyone working in packages/app',
		})
		expect(() => whereReference('guide', layers, { root, in: root })).toThrow(
			expect.objectContaining({ code: 'in-not-below-root' }),
		)
	})

	it('gives no files for an invalid name', () => {
		const { root, layers } = setup()

		expect(whereReference('a/b/c', layers, { root })).toMatchObject({ status: 'invalid', files: [] })
	})
})
