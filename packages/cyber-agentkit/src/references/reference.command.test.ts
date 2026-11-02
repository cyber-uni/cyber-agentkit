import { describe, expect, it } from 'vitest'
import { createReferenceCommand } from './reference.command.js'

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
			'implementations',
			'check',
		])
	})
})
