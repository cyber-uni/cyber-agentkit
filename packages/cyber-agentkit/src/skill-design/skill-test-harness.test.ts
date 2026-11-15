import { describe, expect, it } from 'vitest'
import { headlessInvocation } from '../headless/headless-invocation.js'
import { resolveModel, resolvePlanModels, skillTestHarness, skillTestHarnesses } from './skill-test-harness.js'
import type { TestPlan } from './test-plan.js'

describe('skillTestHarness', () => {
	it('drives Claude Code through the Agent SDK, with its isolation from the harness definition', () => {
		const claude = headlessInvocation('claude-code')
		expect(skillTestHarness('claude-code')).toEqual({
			id: 'claude-code',
			isolation: claude.supported === true ? claude.isolation : undefined,
			leaks: undefined,
			tiers: { small: 'haiku', mid: 'sonnet', top: 'opus', research: ['E-CC-H13'] },
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
				modelFlag: '--model',
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

describe('resolveModel (R161)', () => {
	const claude = { id: 'claude-code' as const, tiers: { small: 'haiku', mid: 'sonnet', top: 'opus', research: [] } }
	const codex = { id: 'codex' as const }

	it("takes the harness's mid tier when no model is named, or its own default when its tiers are not known", () => {
		expect(resolveModel(claude, undefined)).toEqual({ model: 'sonnet' })
		expect(resolveModel(codex, undefined)).toEqual({ model: undefined })
	})

	it('turns a tier into the harness model and passes a model ID as given', () => {
		expect(resolveModel(claude, 'small')).toEqual({ model: 'haiku' })
		expect(resolveModel(claude, 'top')).toEqual({ model: 'opus' })
		expect(resolveModel(claude, 'claude-sonnet-5-5')).toEqual({ model: 'claude-sonnet-5-5' })
		expect(resolveModel(codex, 'gpt-5.6-luna')).toEqual({ model: 'gpt-5.6-luna' })
	})

	it('answers a problem for a tier the harness does not map', () => {
		expect(resolveModel(codex, 'mid')).toEqual({
			problem: 'codex has no known mid-tier model; name a model ID instead of the tier',
		})
	})
})

describe('resolvePlanModels (R161)', () => {
	const plan = (models: (string | undefined)[]): TestPlan => ({
		runs: 3,
		threshold: 2,
		timeout: 300,
		concurrency: 1,
		criteria: [],
		notTested: [],
		notRun: [],
		cases: models.map((model, index) => ({
			id: `c${index + 1}`,
			kind: 'outcome',
			prompt: 'p',
			rubrics: {},
			judged: {},
			...(model ? { model } : {}),
		})),
	})
	const claude = skillTestHarness('claude-code') as Exclude<ReturnType<typeof skillTestHarness>, { problem: string }>

	it("resolves each case's own tier and records the test's model on the plan", () => {
		const resolved = resolvePlanModels(plan([undefined, 'top', 'm-1']), claude, 'small')
		expect(resolved).toMatchObject({ model: 'haiku', plan: { model: 'haiku' } })
		expect('plan' in resolved && resolved.plan.cases.map((item) => item.model)).toEqual([undefined, 'opus', 'm-1'])
	})

	it('records `default` when the harness picks the model, and names the case whose tier it does not map', () => {
		const codex = skillTestHarness('codex') as typeof claude
		expect(resolvePlanModels(plan([undefined]), codex, undefined)).toMatchObject({
			model: undefined,
			plan: { model: 'default' },
		})
		expect(resolvePlanModels(plan([undefined, 'mid']), codex, 'gpt-x')).toEqual({
			problem: 'case c2: codex has no known mid-tier model; name a model ID instead of the tier',
		})
	})
})
