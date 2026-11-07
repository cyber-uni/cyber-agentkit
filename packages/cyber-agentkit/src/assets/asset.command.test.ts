import { describe, expect, it } from 'vitest'
import { createAssetCommand } from './asset.command.js'

type Group = { commands: { name: string; examples?: { command: string; description: string }[] }[] }

describe('asset command', () => {
	it.each([
		['cyber-agentkit asset', undefined],
		['buddy-agent-harness asset', 'buddy-agent-harness asset'],
	])('gives every subcommand examples that start with `%s`', (expected, path) => {
		const group = createAssetCommand({ path }) as unknown as Group
		for (const command of group.commands) {
			expect(command.examples?.length, command.name).toBeGreaterThan(0)
			for (const { command: line } of command.examples ?? [])
				expect(line).toMatch(new RegExp(`^${expected} ${command.name}\\b`))
		}
	})
})
