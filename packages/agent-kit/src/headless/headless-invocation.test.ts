import { describe, expect, it } from 'vitest'

import { harnessIds } from '../harness/harness-id.js'
import { headlessCommand, headlessInvocation } from './headless-invocation.js'

describe('headlessInvocation', () => {
	it('runs Claude Code with -p and reads usage and cost from the result message', () => {
		const mode = headlessInvocation('claude-code')
		expect(mode).toMatchObject({
			supported: true,
			executable: 'claude',
			oneShot: ['-p'],
			permission: { flag: '--permission-mode', unattended: ['--permission-mode', 'bypassPermissions'] },
			transcript: { baseDirEnv: 'CLAUDE_CONFIG_DIR', disable: ['--no-session-persistence'] },
		})
		if (mode.supported !== true) throw new Error('unreachable')
		expect(mode.outputFormats.find((f) => f.name === 'stream-json')).toEqual({
			name: 'stream-json',
			args: ['--output-format', 'stream-json', '--verbose'],
			usage: { event: 'result', tokens: 'usage', costUsd: 'total_cost_usd', accumulate: 'last' },
		})
	})

	it('runs Codex with exec and sums per-turn usage, with no cost', () => {
		const mode = headlessInvocation('codex')
		expect(mode).toMatchObject({ supported: true, executable: 'codex', oneShot: ['exec'] })
		if (mode.supported !== true) throw new Error('unreachable')
		const jsonl = mode.outputFormats.find((f) => f.name === 'jsonl')
		expect(jsonl?.usage).toEqual({ event: 'turn.completed', tokens: 'usage', accumulate: 'sum' })
		expect(jsonl?.usage?.costUsd).toBeUndefined()
	})

	it('puts the default output format first, selected by no arguments', () => {
		for (const harness of harnessIds) {
			const mode = headlessInvocation(harness)
			if (mode.supported === true) expect(mode.outputFormats[0]?.args).toEqual([])
		}
	})

	it('reports Copilot in VS Code as having no headless mode', () => {
		expect(headlessInvocation('vscode-copilot')).toMatchObject({ supported: false, research: ['E-VSC-H1'] })
	})

	it.each(['opencode', 'kilo', 'cline', 'crush', 'openhands', 'augment'] as const)(
		'reports %s as unknown, since its flags are not verified',
		(harness) => {
			expect(headlessInvocation(harness)).toMatchObject({ harness, supported: 'unknown' })
		},
	)

	it('cites research for every harness', () => {
		for (const harness of harnessIds) expect(headlessInvocation(harness).research.length).toBeGreaterThan(0)
	})
})

describe('headlessCommand', () => {
	it('builds an unattended Claude Code run with the prompt last', () => {
		expect(
			headlessCommand('claude-code', {
				prompt: 'fix it',
				model: 'sonnet',
				permission: 'unattended',
				outputFormat: 'stream-json',
			}),
		).toEqual({
			executable: 'claude',
			args: [
				'-p',
				'--model',
				'sonnet',
				'--permission-mode',
				'bypassPermissions',
				'--output-format',
				'stream-json',
				'--verbose',
				'fix it',
			],
		})
	})

	it('passes a named permission mode through its flag', () => {
		expect(headlessCommand('codex', { prompt: 'p', permission: 'workspace-write' })?.args).toEqual([
			'exec',
			'--sandbox',
			'workspace-write',
			'p',
		])
	})

	it('passes the prompt as the value of the prompt flag where the harness has one', () => {
		expect(headlessCommand('copilot-cli', { prompt: 'p', permission: 'unattended', outputFormat: 'json' })).toEqual({
			executable: 'copilot',
			args: ['--allow-all', '--output-format', 'json', '-p', 'p'],
		})
		expect(headlessCommand('gemini-cli', { prompt: 'p' })?.args).toEqual(['-p', 'p'])
	})

	it('returns undefined for a harness without a verified headless mode', () => {
		expect(headlessCommand('vscode-copilot', { prompt: 'p' })).toBeUndefined()
		expect(headlessCommand('opencode', { prompt: 'p' })).toBeUndefined()
	})

	it('throws on an output format the harness lacks', () => {
		expect(() => headlessCommand('codex', { prompt: 'p', outputFormat: 'stream-json' })).toThrow(
			'codex has no output format "stream-json"',
		)
	})

	it('throws on a permission mode the harness has no flag for', () => {
		expect(() => headlessCommand('claude-code', { prompt: 'p', permission: 'yolo' })).toThrow(
			'claude-code has no permission mode "yolo"',
		)
		expect(() => headlessCommand('cursor', { prompt: 'p', permission: 'plan' })).toThrow(
			'cursor has no permission mode "plan"',
		)
	})
})
