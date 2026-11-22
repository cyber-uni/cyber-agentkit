import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { consumerPaths } from './reference-consumer-files.js'
import { withoutFences } from './reference-loads.js'
import { loadsIn } from './reference-uses.js'

describe('loadsIn', () => {
	it('reads a dotted name', () => {
		expect(loadsIn('Load `project-tracker.levels` with the `reference` skill of `cyber-agentkit`.')).toEqual({
			names: ['project-tracker.levels'],
			interfaces: [],
		})
	})

	it('reads several names in one sentence, dotted or not', () => {
		expect(
			loadsIn('Load `levels`, `project-tracker.levels`, and `a.b.c` with the `reference` skill of `cyber-agentkit`.')
				.names,
		).toEqual(['levels', 'project-tracker.levels', 'a.b.c'])
	})

	it('reads the interface form with a dotted id', () => {
		expect(
			loadsIn(
				'Load the implementations of the `project-tracker.capabilities` interface with the `reference` skill of `cyber-agentkit`.',
			),
		).toEqual({ names: [], interfaces: ['project-tracker.capabilities'] })
	})

	it("still ends the clause at a sentence's final period", () => {
		expect(loadsIn('Load `a`. Then read the notes with the `reference` skill.').names).toEqual([])
	})

	it('reads each load line in a text on its own', () => {
		const text = [
			'Load `x.one` with the `reference` skill of `cyber-agentkit`.',
			'Some other prose. Load `y.two` with the `reference` skill of `cyber-agentkit`.',
		].join('\n')
		expect(loadsIn(text).names).toEqual(['x.one', 'y.two'])
	})
})

describe('loadsIn: a long or hostile text', () => {
	it('reads two load lines in one sentence once each', () => {
		expect(
			loadsIn('Load `a` with the `reference` skill, then Load `b` with the `reference` skill of `cyber-agentkit`.')
				.names,
		).toEqual(['a', 'b'])
	})

	it('reads a clause broken across lines', () => {
		expect(loadsIn('Load `a`\n  and `b` with the\n`reference` skill.').names).toEqual(['a', 'b'])
	})

	it('stays fast on many repeated load openings with no load phrase', () => {
		const started = performance.now()
		loadsIn(`Load ${'`Load `'.repeat(20000)}`)
		loadsIn(`Load${' '.repeat(50000)}x`)
		expect(performance.now() - started).toBeLessThan(1000)
	})
})

describe('loadsIn: many sentences', () => {
	it('stays fast on many sentences that hold no load line', () => {
		const started = performance.now()
		expect(loadsIn('x. '.repeat(100000)).names).toEqual([])
		expect(loadsIn(`${'Load x. '.repeat(50000)}`).names).toEqual([])
		expect(performance.now() - started).toBeLessThan(1000)
	})
})

describe('consumerPaths and withoutFences: what a skill reads', () => {
	it('skips a skill folder’s evals and root README', () => {
		const dir = mkdtempSync(join(tmpdir(), 'uses-skill-'))
		mkdirSync(join(dir, 'evals', 'files'), { recursive: true })
		writeFileSync(join(dir, 'SKILL.md'), '# s\n')
		writeFileSync(join(dir, 'README.md'), 'needs `universal-plugin`\n')
		writeFileSync(join(dir, 'evals', 'files', 'SKILL.md'), 'Load `x.y` with the `reference` skill.\n')
		const [consumer] = consumerPaths([dir], '/')
		expect(consumer?.files.map((file) => file.path.slice(dir.length + 1))).toEqual(['SKILL.md'])
	})

	it('ignores an example span', () => {
		expect(
			loadsIn(
				withoutFences('Load `a` with the `reference` skill. <example>Load `b` with the `reference` skill.</example>'),
			).names,
		).toEqual(['a'])
	})
})
