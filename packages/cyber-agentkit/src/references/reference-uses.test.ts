import { describe, expect, it } from 'vitest'
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
