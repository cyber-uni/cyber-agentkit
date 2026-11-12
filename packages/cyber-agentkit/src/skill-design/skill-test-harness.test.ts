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

	it('answers a problem for a harness it has no driver for', () => {
		expect(skillTestHarness('gemini-cli')).toEqual({
			problem: 'skill test cannot drive gemini-cli; it drives claude-code',
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
