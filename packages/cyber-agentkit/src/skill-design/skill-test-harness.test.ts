import { describe, expect, it } from 'vitest'
import { headlessInvocation } from '../headless/headless-invocation.js'
import { skillTestHarness, skillTestHarnesses } from './skill-test-harness.js'

describe('skillTestHarness', () => {
	it('drives Claude Code through the Agent SDK, with its isolation from the harness definition', () => {
		const claude = headlessInvocation('claude-code')
		expect(skillTestHarness('claude-code')).toEqual({
			id: 'claude-code',
			isolation: claude.supported === true ? claude.isolation : undefined,
			leaks: undefined,
		})
	})

	it('drives Codex through its CLI: one run writing only in its folder, no transcript, without the user config', () => {
		const codex = skillTestHarness('codex', 'gpt-5.6-luna')
		expect(codex).toMatchObject({
			id: 'codex',
			command: {
				executable: 'codex',
				args: [
					'exec',
					'--model',
					'gpt-5.6-luna',
					'--sandbox',
					'workspace-write',
					'--json',
					'--ephemeral',
					'--ignore-user-config',
					'--ignore-rules',
				],
			},
			isolation: { projectSkills: '.agents/skills', configDir: { env: 'CODEX_HOME', default: '~/.codex' } },
		})
		expect('leaks' in codex && codex.leaks).toMatch(/AGENTS\.md/)
	})

	it('answers a problem for a harness it has no driver for', () => {
		expect(skillTestHarness('gemini-cli')).toEqual({
			problem: 'skill test cannot drive gemini-cli; it drives claude-code, codex',
		})
		expect(skillTestHarness('vscode-copilot')).toHaveProperty('problem')
	})

	it('drives only harnesses whose definition declares where a run keeps its config, skills, plugins, and login', () => {
		for (const id of skillTestHarnesses) {
			const mode = headlessInvocation(id)
			expect(mode.supported === true && mode.isolation?.research.length).toBeTruthy()
		}
	})
})
