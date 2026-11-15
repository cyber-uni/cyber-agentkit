import { describe, expect, it } from 'vitest'
import { recognizeSandboxFault, sandboxFaults } from './sandbox-faults.js'

/** The error the full runs of the `skill` skill hit (cyber-agentkit#238, E-CC-D17, E-CC-D18). */
const bwrap =
	"bwrap: Can't create file at /tmp/skill-test-plugin-Xa1b2C/references/.claude/launch.json: Read-only file system"

describe('recognizeSandboxFault (R154)', () => {
	it('recognizes the read-only sandbox error from cyber-agentkit#238 in a command output', () => {
		expect(recognizeSandboxFault(`Exit code 1\n${bwrap}\n`)).toEqual({ fault: 'bwrap-read-only-mount', text: bwrap })
	})

	it('recognizes it for any folder and hidden path', () => {
		const other = "bwrap: Can't create file at /tmp/skill-test-plugin-q/skills/skill/.mcp.json: Read-only file system"
		expect(recognizeSandboxFault(other)?.fault).toBe('bwrap-read-only-mount')
	})

	it('recognizes nothing in ordinary failures, a read-only error of another program, or a sandbox that could not start', () => {
		for (const text of [
			'cat: notes.txt: No such file or directory',
			"touch: cannot touch '/usr/x': Read-only file system",
			'bwrap: No permissions to creating new namespace',
			'',
		])
			expect(recognizeSandboxFault(text)).toBeUndefined()
	})

	it('keeps each fault named once, with a cause for the report', () => {
		const ids = sandboxFaults.map((fault) => fault.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (const fault of sandboxFaults) expect(fault.cause).not.toBe('')
	})

	it('takes another list of faults', () => {
		expect(recognizeSandboxFault('boom: mount failed', [{ id: 'boom', pattern: 'boom: \\w+ failed' }])).toEqual({
			fault: 'boom',
			text: 'boom: mount failed',
		})
	})
})
