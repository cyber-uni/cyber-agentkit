import { describe, expect, it } from 'vitest'
import { createReferenceCommand, createReferenceCommands } from './reference.command.js'

type Node = { name: string; examples?: { command: string; description: string }[] }

describe('reference command', () => {
	it('groups every subcommand under `reference`', () => {
		const command = createReferenceCommand() as unknown as { name: string; commands: { name: string }[] }

		expect(command.name).toBe('reference')
		expect(command.commands.map(({ name }) => name)).toEqual([
			'load',
			'list',
			'search',
			'where',
			'create',
			'customize',
			'delete',
			'migrate',
			'implementations',
			'audit',
			'check',
			'register',
		])
	})

	it('gives every subcommand examples that start with `cyber-agentkit reference` by default', () => {
		for (const command of Object.values(createReferenceCommands()) as unknown as Node[]) {
			expect(command.examples?.length, command.name).toBeGreaterThan(0)
			for (const { command: line } of command.examples ?? [])
				expect(line).toMatch(new RegExp(`^cyber-agentkit reference ${command.name}\\b`))
		}
	})

	it('starts every example with the path the host mounts the commands at', () => {
		const path = 'buddy-agent-harness reference'
		const group = createReferenceCommand({ path }) as unknown as { commands: Node[] }
		for (const command of group.commands)
			for (const { command: line } of command.examples ?? [])
				expect(line).toMatch(new RegExp(`^${path} ${command.name}\\b`))
	})
})
