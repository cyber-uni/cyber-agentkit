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
		{ tier: 'project', dir: join(root, '.agents', 'references') },
		{ tier: 'user', dir: join(home, '.agents', 'references') },
		{ tier: 'plugin', dir: plugin, plugin: 'a' },
	]
	return { root, home, plugin, layers }
}

describe('whereReference', () => {
	it('gives the project and user files, who each reaches, and the heading paths below each', () => {
		const { root, home, plugin, layers } = setup()
		write(plugin, 'guide.md', '## Setup\n\n### Steps\n\n## Usage\n')
		write(join(home, '.agents', 'references'), 'guide.md', '## Extra\n')

		const report = whereReference('guide', layers, { root })

		expect(report.status).toBe('found')
		expect(report.places).toEqual([
			{
				scope: 'project',
				path: join('.agents', 'references', 'guide.md'),
				reaches: 'everyone working in this repository',
				status: 'empty',
				sections: ['Setup', 'Setup > Steps', 'Usage', 'Extra'],
			},
			{
				scope: 'user',
				path: join(home, '.agents', 'references', 'guide.md'),
				reaches: 'only you, in every repository',
				status: 'used',
				sections: ['Setup', 'Setup > Steps', 'Usage'],
			},
		])
		expect(report.layers.map(({ tier }) => tier)).toEqual(['project', 'user', 'plugin'])
	})

	it('gives the options and the places a selection goes on an ambiguous name', () => {
		const { root, layers } = setup()
		const other = tempDir()
		write(layers[2]?.dir as string, 'guide.md', '## A\n')
		write(other, 'guide.md', '## B\n')

		const report = whereReference('guide', [...layers, { tier: 'plugin', dir: other, plugin: 'b' }], { root })

		expect(report.status).toBe('ambiguous')
		expect(report.options).toEqual(['a/guide', 'b/guide'])
		expect(report.places.map(({ scope }) => scope)).toEqual(['project', 'user'])
	})

	it('gives no places for an invalid name', () => {
		const { root, layers } = setup()

		expect(whereReference('a/b/c', layers, { root })).toMatchObject({ status: 'invalid', places: [] })
	})
})
