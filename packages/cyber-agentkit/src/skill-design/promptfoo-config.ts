import { sandboxFaults } from './sandbox-faults.js'
import type { SkillTestHarness } from './skill-test-harness.js'
import type { TestPlan } from './test-plan.js'
import type { SandboxTemplate } from './test-sandbox.js'
import { usageLimits } from './usage-limits.js'

/** The sandbox runtime version that contains a case's setup script and `script` checks (research E22). */
export const scriptSandboxPackage = '@anthropic-ai/sandbox-runtime@0.0.81'

/** The promptfoo, Agent SDK, and script sandbox versions `skill test` runs through npx (research E20, E22). */
export const promptfooPackages = [
	'promptfoo@0.125.1',
	'@anthropic-ai/claude-agent-sdk@0.3.322',
	scriptSandboxPackage,
] as const

export type ConfigOptions = {
	skillName: string
	skillFolder: string
	/** The other version to compare with; without it the baseline is a run without the skill. */
	baselineFolder?: string | undefined
	model?: string | undefined
	judge?: string | undefined
	/** The provider file's path, relative to the config. */
	provider: string
	/** The progress file's absolute path, and the `afterEach` hook file's path relative to the config (R98): without them a run reports no progress. */
	progress?: { file: string; hook: string } | undefined
	/**
	 * The plugin the skill is developed in (R91): each arm loads its own copy of it, `withSkill` holding the skill and
	 * `baseline` holding the baseline's version or none. The skill is then not copied into the run folder. Both arms
	 * also load `dependencies`, the folders of the plugins it depends on (E-CC-H10).
	 */
	plugin?: { name: string; withSkill: string; baseline: string; dependencies?: string[] | undefined } | undefined
	/** The harness each run drives, with where it keeps its config, skills, plugins, and login. */
	harness: SkillTestHarness
	/**
	 * Arms that each load an instruction instead of the skill and its baseline (`instruction compare`): `label` names the
	 * arm in promptfoo's output, `arm` in the progress lines, and `instruction` is the text put in the project
	 * instruction file. `skillFolder`, `baselineFolder`, and `plugin` are then not used.
	 */
	arms?: { label: string; arm: string; instruction: string }[] | undefined
	/** The file the first run that reaches the usage limit writes, so no later run starts (R162); absolute. */
	limitFile?: string | undefined
	/**
	 * Only these runs, for a resume (R163): each is one run of a case, by its number, in the arms named (`skill`,
	 * `baseline`). Each becomes a test of its own that runs once, and the provider skips the arms it does not name.
	 */
	slots?: { case: string; run: number; arms: string[] }[] | undefined
	/**
	 * The sandbox template each run takes (#302): `folder-only` runs shell commands, setup scripts, and `script` checks
	 * without a sandbox. `default` when absent.
	 */
	sandbox?: SandboxTemplate | undefined
	/** The config's description; `skill test: <skill name>` when absent. */
	description?: string | undefined
}

/**
 * What one run may spend, in US dollars, as the provider estimates it from the run's transcript. The provider holds
 * it, not the Agent SDK's `max_budget_usd`: Claude Code shows that budget to the model as a reminder, and a run that
 * sees "$0.50 budget" stops for that reason instead of the skill's own (#238).
 */
export const runCostCap = 0.5

/** The Agent SDK options for every run: only the run folder's own skills and settings, no web, a turn cap. */
function inner(model: string | undefined): Record<string, unknown> {
	return {
		...(model ? { model } : {}),
		apiKeyRequired: false,
		max_turns: 20,
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
	const provider = (label: string, arm: string, skillDir: string | undefined, instruction?: string) => ({
		id: `file://${options.provider}`,
		label,
		config: {
			arm,
			skillName: options.skillName,
			timeout: plan.timeout,
			// The errors the provider watches each shell command's output for (R154).
			sandboxFaults: sandboxFaults.map(({ id, pattern }) => ({ id, pattern })),
			// The usage-limit messages that end a run as limit reached, and stop the runs after it (R162).
			usageLimits: usageLimits.map(({ id, pattern }) => ({ id, pattern })),
			...(options.limitFile ? { limitFile: options.limitFile } : {}),
			harness: options.harness.id,
			isolation: options.harness.isolation,
			...(options.harness.command ? { command: options.harness.command } : {}),
			...(options.progress ? { progressFile: options.progress.file } : {}),
			...(instruction !== undefined
				? { instruction }
				: plugin
					? {
							pluginName: plugin.name,
							pluginDir: arm === 'skill' ? plugin.withSkill : plugin.baseline,
							...(plugin.dependencies?.length ? { dependencyDirs: plugin.dependencies } : {}),
						}
					: skillDir
						? { skillDir }
						: {}),
			...(options.sandbox === 'folder-only' ? { unsandboxed: true } : {}),
			costCap: runCostCap,
			inner: inner(options.model),
		},
	})
	const testOf = (item: TestPlan['cases'][number]) => {
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
				// A case's own model wins over the run's (R161).
				...(item.model ? { model: item.model } : {}),
				...(item.files ? { files: item.files } : {}),
				...(item.setup ? { setup: item.setup } : {}),
				...(item.network?.length ? { network: JSON.stringify(item.network) } : {}),
				rubrics: JSON.stringify(item.rubrics),
			},
			assert,
		}
	}
	const tests = options.slots
		? options.slots.flatMap((slot) => {
				const item = plan.cases.find((planned) => planned.id === slot.case)
				if (!item) return []
				const test = testOf(item)
				return [{ ...test, vars: { ...test.vars, __run: String(slot.run), __arms: JSON.stringify(slot.arms) } }]
			})
		: plan.cases.map(testOf)
	return {
		description: options.description ?? `skill test: ${options.skillName}`,
		prompts: ['{{prompt}}'],
		...(options.progress ? { extensions: [`file://${options.progress.hook}:afterEach`] } : {}),
		evaluateOptions: { maxConcurrency: plan.concurrency, repeat: options.slots ? 1 : plan.runs },
		providers: options.arms
			? options.arms.map((item) => provider(item.label, item.arm, undefined, item.instruction))
			: [
					provider('with-skill', 'skill', options.skillFolder),
					options.baselineFolder
						? provider('baseline', 'baseline', options.baselineFolder)
						: provider('baseline', 'baseline', undefined),
				],
		tests,
	}
}
