import type { HarnessId } from '../harness/harness-id.js'
import {
	type HeadlessIsolation,
	type HeadlessModelTiers,
	headlessCommand,
	headlessInvocation,
	type ModelTier,
	modelTiers,
} from '../headless/headless-invocation.js'
import type { TestPlan } from './test-plan.js'

/** The harnesses `skill test` can drive: Claude Code through the Agent SDK, the others through their own CLI. */
export const skillTestHarnesses = ['claude-code', 'codex'] as const satisfies readonly HarnessId[]

/** A harness `skill test` drives, with where a run keeps its config, skills, plugins, and login. */
export type SkillTestHarness = {
	id: HarnessId
	isolation: HeadlessIsolation
	/**
	 * The command line before the prompt, for a harness driven through its CLI, with the flag that selects the model so
	 * a case that names its own model can replace the run's.
	 */
	command?: { executable: string; args: string[]; modelFlag: string } | undefined
	/** The model each tier names on this harness, when its definition says (R161). */
	tiers?: HeadlessModelTiers | undefined
	/** What still reaches a run from the user's setup, to report as a warning. */
	leaks?: string | undefined
}

/**
 * The driver for one harness, from its headless definition (`headlessInvocation`): its isolation, and for a CLI
 * driver the command line that runs it unattended inside the run folder, writing no transcript. Answers a problem
 * for a harness `skill test` has no driver for, or whose isolation is not verified.
 */
export function skillTestHarness(id: HarnessId, model?: string): SkillTestHarness | { problem: string } {
	const mode = headlessInvocation(id)
	const known = skillTestHarnesses.join(', ')
	if (!(skillTestHarnesses as readonly HarnessId[]).includes(id) || mode.supported !== true || !mode.isolation)
		return { problem: `skill test cannot drive ${id}; it drives ${known}` }
	const isolation = mode.isolation
	const leaks = isolation.leaks
	const tiers = mode.modelTiers ? { tiers: mode.modelTiers } : {}
	if (id === 'claude-code') return { id, isolation, leaks, ...tiers }
	// Codex writes only inside the run folder (`workspace-write`), and keeps the user's config out (E-CODEX-H6).
	const command = headlessCommand(id, {
		prompt: '',
		model,
		permission: 'workspace-write',
		outputFormat: 'jsonl',
	}) as { executable: string; args: readonly string[] }
	const args = command.args.slice(0, -1)
	args.push(...(mode.transcript?.disable ?? []))
	if (isolation.login.store === 'config-dir') args.push(...isolation.login.args)
	return {
		id,
		isolation,
		command: { executable: command.executable, args, modelFlag: mode.modelFlag },
		leaks,
		...tiers,
	}
}

/** How a result names the model when the harness picked it (R161). */
export const harnessDefault = 'default'

/** The tier `skill test` runs on when no model is named (R161). */
export const defaultTier: ModelTier = 'mid'

/**
 * The model a run passes to the harness for a model or tier the author named (R161): a tier the harness's definition
 * maps becomes its model, and anything else is a model ID, passed as given. With none named it is the harness's
 * mid-tier model, or `undefined`, the harness's own default, when its tiers are not known. A tier the harness does
 * not map is a problem.
 */
export function resolveModel(
	harness: Pick<SkillTestHarness, 'id' | 'tiers'>,
	named: string | undefined,
): { model: string | undefined } | { problem: string } {
	if (named === undefined) return { model: harness.tiers?.[defaultTier] }
	if (!(modelTiers as readonly string[]).includes(named)) return { model: named }
	const model = harness.tiers?.[named as ModelTier]
	if (model) return { model }
	return { problem: `${harness.id} has no known ${named}-tier model; name a model ID instead of the tier` }
}

/**
 * The plan with each case's own model or tier turned into the model its runs pass, and the test's model, from the
 * model or tier the author named (R161). A tier the harness does not map, for the test or a case, is a problem.
 */
export function resolvePlanModels(
	plan: TestPlan,
	harness: Pick<SkillTestHarness, 'id' | 'tiers'>,
	named: string | undefined,
): { plan: TestPlan; model: string | undefined } | { problem: string } {
	const run = resolveModel(harness, named)
	if ('problem' in run) return run
	const cases: TestPlan['cases'] = []
	for (const item of plan.cases) {
		if (item.model === undefined) {
			cases.push(item)
			continue
		}
		const own = resolveModel(harness, item.model)
		if ('problem' in own) return { problem: `case ${item.id}: ${own.problem}` }
		cases.push({ ...item, model: own.model as string })
	}
	return { plan: { ...plan, model: run.model ?? harnessDefault, cases }, model: run.model }
}
