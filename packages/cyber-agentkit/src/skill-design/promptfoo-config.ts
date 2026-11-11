import type { TestPlan } from './test-plan.js'

/** The promptfoo and Agent SDK versions `skill test` runs through npx (research E20). */
export const promptfooPackages = ['promptfoo@0.125.1', '@anthropic-ai/claude-agent-sdk@0.3.322'] as const

export type ConfigOptions = {
	skillName: string
	skillFolder: string
	/** The other version to compare with; without it the baseline is a run without the skill. */
	baselineFolder?: string | undefined
	model?: string | undefined
	judge?: string | undefined
	/** The provider file's path, relative to the config. */
	provider: string
	/**
	 * The plugin the skill is developed in (R91): each arm loads its own copy of it, `withSkill` holding the skill and
	 * `baseline` holding the baseline's version or none. The skill is then not copied into the run folder.
	 */
	plugin?: { name: string; withSkill: string; baseline: string } | undefined
}

/** The Agent SDK options for every run: only the run folder's own skills and settings, no web, a turn and cost cap. */
function inner(model: string | undefined): Record<string, unknown> {
	return {
		...(model ? { model } : {}),
		apiKeyRequired: false,
		max_turns: 20,
		max_budget_usd: 0.5,
		setting_sources: ['project'],
		skills: 'all',
		permission_mode: 'acceptEdits',
		append_allowed_tools: ['Write', 'Edit', 'Bash'],
		// No one answers a question in a run, so asking would wait until the time limit.
		disallowed_tools: ['WebFetch', 'WebSearch', 'AskUserQuestion'],
	}
}

/** The promptfoo config for a plan: one provider per arm and one test per case, each criterion an assertion named by its ID. */
export function promptfooConfig(plan: TestPlan, options: ConfigOptions): Record<string, unknown> {
	const plugin = options.plugin
	const provider = (label: string, arm: string, skillDir: string | undefined) => ({
		id: `file://${options.provider}`,
		label,
		config: {
			arm,
			skillName: options.skillName,
			timeout: plan.timeout,
			...(plugin
				? { pluginName: plugin.name, pluginDir: arm === 'skill' ? plugin.withSkill : plugin.baseline }
				: skillDir
					? { skillDir }
					: {}),
			inner: inner(options.model),
		},
	})
	const tests = plan.cases.map((item) => {
		const assert: Record<string, unknown>[] = []
		if (item.kind === 'trigger') {
			const fired = 'context.providerResponse.metadata.skipped || context.providerResponse.metadata.fired'
			assert.push({
				type: 'javascript',
				value:
					item.expect === 'fire'
						? `!!(${fired})`
						: '!!context.providerResponse.metadata.skipped || !context.providerResponse.metadata.fired',
				metric: 'fired',
			})
		}
		for (const id of Object.keys(item.rubrics))
			assert.push({
				type: 'javascript',
				value: `!!context.providerResponse.metadata.checks?.[${JSON.stringify(id)}]?.pass`,
				metric: id,
			})
		for (const [id, rubric] of Object.entries(item.judged))
			assert.push({
				type: 'llm-rubric',
				value: rubric,
				metric: id,
				provider: {
					id: 'anthropic:claude-agent-sdk',
					config: { model: options.judge, apiKeyRequired: false, setting_sources: [], max_turns: 2 },
				},
			})
		return {
			description: item.id,
			vars: {
				prompt: item.prompt,
				kind: item.kind,
				...(item.files ? { files: item.files } : {}),
				rubrics: JSON.stringify(item.rubrics),
			},
			assert,
		}
	})
	return {
		description: `skill test: ${options.skillName}`,
		prompts: ['{{prompt}}'],
		evaluateOptions: { maxConcurrency: 3, repeat: plan.runs },
		providers: [
			provider('with-skill', 'skill', options.skillFolder),
			options.baselineFolder
				? provider('baseline', 'baseline', options.baselineFolder)
				: provider('baseline', 'baseline', undefined),
		],
		tests,
	}
}
