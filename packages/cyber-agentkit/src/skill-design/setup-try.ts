import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { promptfooConfig } from './promptfoo-config.js'
import { promptfooProviderSource } from './promptfoo-provider-source.js'
import { type PromptfooRun, setupProblem } from './skill-test.js'
import type { SkillTestHarness } from './skill-test-harness.js'
import type { TestPlan } from './test-plan.js'
import type { SandboxSettings } from './test-sandbox.js'

/**
 * `skill case try`: runs one outcome case's setup script alone, as a `skill test` run runs it, in the same provider,
 * script sandbox, and empty home, and makes no model call (#290). The run's folder and home, as the setup left them,
 * are kept under `keep`, so nothing needs deleting by hand.
 */
export type TriedSetup = {
	skill: string
	case: string
	/** The run's folder as the setup left it: a git repository holding the case's files. */
	folder: string
	/** The run's home as the setup left it, holding what it wrote there, such as a global git config. */
	home: string
	/** `git status --porcelain` in the run's folder after the setup. */
	status: string
	/** What the setup script printed. */
	said: string
	/** Whether the setup script exited non-zero; a run would then report the case as not run. */
	failed: boolean
}

export type TryProblemCode = 'no-setup' | 'login' | 'sandbox' | 'try-failed'

type Tried = { status: string; said: string; failed: boolean }

/** Runs the setup of `plan`'s one outcome case under the harness's isolation, and keeps what it made under `keep`. */
export async function trySetup(options: {
	plan: TestPlan
	skillFolder: string
	skillName: string
	harness: SkillTestHarness
	keep: string
	run: PromptfooRun
	/** The sandbox settings the setup runs in, as `skill-design.test.sandbox` resolved them (#302). */
	sandbox: SandboxSettings
}): Promise<TriedSetup | { code: TryProblemCode; problem: string }> {
	const item = options.plan.cases[0]
	if (item?.kind !== 'outcome' || item.setup === undefined)
		return {
			code: 'no-setup',
			problem: `case ${item?.id ?? '(none)'} has no setup script to try; a run starts from its files alone`,
		}
	const plan: TestPlan = { ...options.plan, cases: [item], runs: 1, concurrency: 1 }
	const config = promptfooConfig(plan, {
		harness: options.harness,
		skillName: options.skillName,
		skillFolder: options.skillFolder,
		provider: './provider.mjs',
		description: `skill case try: ${options.skillName} ${item.id}`,
		sandbox: options.sandbox,
	}) as { providers: { config: Record<string, unknown> }[]; tests: { assert: unknown[] }[] }
	// One arm, no assertion: the provider stops after the setup, so nothing is judged and no model is called.
	const [arm] = config.providers
	if (!arm) return { code: 'try-failed', problem: 'the test config has no provider' }
	config.providers = [{ ...arm, config: { ...arm.config, keep: options.keep } }]
	for (const test of config.tests) test.assert = []
	rmSync(options.keep, { recursive: true, force: true })
	mkdirSync(options.keep, { recursive: true })
	const folder = mkdtempSync(join(tmpdir(), 'skill-case-try-'))
	try {
		writeFileSync(join(folder, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(join(folder, 'promptfooconfig.yaml'), stringify(config))
		const ran = await options.run(folder, 'promptfooconfig.yaml', 'output.json')
		if ('problem' in ran) return { code: 'try-failed', problem: `promptfoo did not run: ${ran.problem}` }
		const shared = setupProblem(ran.output)
		if (shared) return shared
		const row = ((
			ran.output as { results?: { results?: { response?: { error?: string; metadata?: { tried?: Tried } } }[] } }
		)?.results?.results ?? [])[0]
		const tried = row?.response?.metadata?.tried
		if (!tried) return { code: 'try-failed', problem: row?.response?.error ?? 'the run answered no setup result' }
		return {
			skill: options.skillFolder,
			case: item.id,
			folder: join(options.keep, 'folder'),
			home: join(options.keep, 'home'),
			...tried,
		}
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}
