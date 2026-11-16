import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import {
	checkGrader,
	type PluginEvalRun,
	pluginEvalDir,
	pluginEvalPlan,
	pluginEvalRows,
	runPluginEvalTest,
	scriptSandboxSettings,
	setupFailedMarker,
	writePluginEvalSuite,
} from './plugin-eval-backend.js'
import { goodSkill, shippedSandbox } from './skill-design.fixtures.js'
import { runTest } from './skill-test.js'
import { planTest, type TestPlan } from './test-plan.js'

function plan(extra: Record<string, string> = {}): TestPlan {
	const planned = planTest(goodSkill(extra), { threads: 8 })
	if ('problem' in planned) throw new Error(planned.problem)
	return planned.plan
}

describe('checkGrader (E-CC-H8)', () => {
	it('turns each text and file check into a regex grader, escaping literal text', () => {
		expect(checkGrader({ contains: '## Notes (v2)' })).toEqual({ type: 'regex', pattern: '## Notes \\(v2\\)' })
		expect(checkGrader({ 'not-contains': 'x' })).toEqual({ type: 'regex', pattern: 'x', match: 'not_contains' })
		expect(checkGrader({ regex: 'a+b' })).toEqual({ type: 'regex', pattern: 'a+b' })
		expect(checkGrader({ 'not-regex': 'a+b' })).toEqual({ type: 'regex', pattern: 'a+b', match: 'not_contains' })
		expect(checkGrader({ 'file-contains': { path: 'NOTES.md', text: '#12.' } })).toEqual({
			type: 'regex',
			pattern: '#12\\.',
			target: { source: 'file', path: 'NOTES.md' },
		})
	})

	it('checks that a file exists after the run by reading it, so a case file counts too', () => {
		expect(checkGrader({ 'file-exists': 'NOTES.md' })).toEqual({
			type: 'regex',
			pattern: '^',
			target: { source: 'file', path: 'NOTES.md' },
		})
	})

	it('has no grader for a script check', () => {
		expect(checkGrader({ script: 'true' })).toBeUndefined()
	})
})

describe('pluginEvalPlan', () => {
	it('reports a criterion with a script check as not tested, and leaves the others', () => {
		const adjusted = pluginEvalPlan(
			plan({
				'evals/evals.yaml': `outcome:
  - { id: two-prs, prompt: write the notes }
rubrics:
  C1:
    - script: "true"
  C2:
    - contains: x
`,
			}),
		)
		expect(adjusted.cases[0]?.rubrics).toEqual({ C2: [{ contains: 'x' }] })
		expect(adjusted.notTested).toContainEqual({
			id: 'C1',
			reason: 'its rubric runs a `script` check, and `claude plugin eval` has no custom-code graders',
		})
	})
})

describe('writePluginEvalSuite', () => {
	it('writes one tagged case.yaml per case, with a fired grader on triggers and one grader per check', () => {
		const target = mkdtempSync(join(tmpdir(), 'plugin-eval-suite-'))
		writePluginEvalSuite(plan(), target, 'release-notes', 'sonnet')
		const trigger = parse(readFileSync(join(target, pluginEvalDir, 'trigger-1', 'case.yaml'), 'utf8'))
		expect(trigger).toMatchObject({
			schema_version: '1.1',
			name: 'trigger-1',
			tags: ['trigger'],
			runs: 3,
			context: { scaffold_script: 'setup.sh' },
			execution: { prompt: 'write release notes', max_turns: 3, model: 'sonnet' },
			graders: [{ name: 'fired', type: 'tool_used', tool: 'Skill' }],
		})
		expect(new RegExp(trigger.graders[0].input_match).test('{"skill": "my-plugin:release-notes"}')).toBe(true)
		const outcome = parse(readFileSync(join(target, pluginEvalDir, 'two-prs', 'case.yaml'), 'utf8'))
		expect(outcome.tags).toEqual(['outcome'])
		expect(outcome.graders.map((g: { name: string }) => g.name)).toEqual(['C1--1', 'C2--1'])
	})

	it("writes a case's own model over the run's (R161)", () => {
		const target = mkdtempSync(join(tmpdir(), 'plugin-eval-suite-'))
		const own = plan()
		own.cases = own.cases.map((item) => (item.id === 'two-prs' ? { ...item, model: 'opus' } : item))
		writePluginEvalSuite(own, target, 'release-notes', 'sonnet')
		const read = (id: string) => parse(readFileSync(join(target, pluginEvalDir, id, 'case.yaml'), 'utf8'))
		expect(read('two-prs').execution.model).toBe('opus')
		expect(read('trigger-1').execution.model).toBe('sonnet')
	})

	it('starts each run in a git repository holding the case files, committed', () => {
		const target = mkdtempSync(join(tmpdir(), 'plugin-eval-suite-'))
		writePluginEvalSuite(plan(), target, 'release-notes')
		const workspace = mkdtempSync(join(tmpdir(), 'plugin-eval-workspace-'))
		execFileSync('bash', [join(target, pluginEvalDir, 'two-prs', 'setup.sh')], { cwd: workspace })
		expect(existsSync(join(workspace, 'prs.json'))).toBe(true)
		expect(execFileSync('git', ['log', '--format=%s'], { cwd: workspace, encoding: 'utf8' }).trim()).toBe('case files')
		expect(execFileSync('git', ['status', '--porcelain'], { cwd: workspace, encoding: 'utf8' })).toBe('')
	})
})

describe('writePluginEvalSuite setup scripts (R155, R157)', () => {
	const cli = join(dirname(createRequire(import.meta.url).resolve('@anthropic-ai/sandbox-runtime')), 'cli.js')
	let down = ''
	const sandboxStarts = (() => {
		const folder = mkdtempSync(join(tmpdir(), 'plugin-eval-srt-'))
		writeFileSync(join(folder, 's.json'), JSON.stringify(scriptSandboxSettings(folder)))
		try {
			execFileSync(process.execPath, [cli, '--settings', join(folder, 's.json'), '-c', 'true'], { stdio: 'pipe' })
			return true
		} catch (error) {
			down = String((error as { stderr?: unknown }).stderr || (error as Error).message).trim()
			return false
		}
	})()
	if (process.env['SKILL_TEST_REQUIRE_SANDBOX'] && !sandboxStarts)
		throw new Error(`the script sandbox does not start on this machine: ${down}`)

	function scaffold(
		setup: string,
		sandbox: { node: string; cli: string } | 'none' = { node: process.execPath, cli },
	): { workspace: string; outside: string; run: () => string; script: string } {
		const skill = goodSkill({
			'evals/evals.yaml': `outcome:
  - { id: two-prs, prompt: write the notes, files: files/two-prs, setup: setup/two-prs.sh }
rubrics:
  C1:
    - contains: x
  C2:
    - contains: x
`,
			'evals/setup/two-prs.sh': setup,
		})
		const planned = planTest(skill, { threads: 8 })
		if ('problem' in planned) throw new Error(planned.problem)
		const target = mkdtempSync(join(tmpdir(), 'plugin-eval-suite-'))
		writePluginEvalSuite(planned.plan, target, 'release-notes', undefined, sandbox)
		const workspace = mkdtempSync(join(tmpdir(), 'plugin-eval-workspace-'))
		const outside = mkdtempSync(join(tmpdir(), 'plugin-eval-outside-'))
		const run = () =>
			execFileSync('bash', [join(target, pluginEvalDir, 'two-prs', 'setup.sh')], {
				cwd: workspace,
				encoding: 'utf8',
				stdio: 'pipe',
				env: { ...process.env, OUTSIDE: outside },
			})
		return { workspace, outside, run, script: readFileSync(join(target, pluginEvalDir, 'two-prs', 'setup.sh'), 'utf8') }
	}

	it('in a folder-only test, runs the setup script in the workspace with no script sandbox, and fails the scaffold with the marker (#302)', () => {
		const passing = scaffold('set -e\necho draft > draft.txt\n', 'none')
		expect(passing.script).not.toContain('srt.json')
		passing.run()
		expect(execFileSync('git', ['status', '--porcelain'], { cwd: passing.workspace, encoding: 'utf8' }).trim()).toBe(
			'?? draft.txt',
		)
		const failing = scaffold('echo broke >&2\nexit 3\n', 'none')
		let said = ''
		try {
			failing.run()
		} catch (error) {
			said = String((error as { stderr?: string }).stderr)
		}
		expect(said).toContain('broke')
		expect(said).toContain(setupFailedMarker)
	})

	it.skipIf(!sandboxStarts)('runs the setup script in the workspace after the case files are committed', () => {
		const { workspace, run } = scaffold(
			'set -e\necho more > more.txt\ngit add more.txt\ngit commit -q -m more\necho draft > draft.txt\n',
		)
		run()
		expect(execFileSync('git', ['log', '--format=%s'], { cwd: workspace, encoding: 'utf8' }).trim()).toBe(
			'more\ncase files',
		)
		expect(execFileSync('git', ['status', '--porcelain'], { cwd: workspace, encoding: 'utf8' }).trim()).toBe(
			'?? draft.txt',
		)
	})

	it.skipIf(!sandboxStarts)('shows the setup script no placeholder for what the sandbox protects', () => {
		const { workspace, run } = scaffold('set -e\ntest -z "$(git status --porcelain --untracked-files=all)"\n')
		run()
		expect(
			execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: workspace, encoding: 'utf8' }),
		).toBe('')
	})

	it.skipIf(!sandboxStarts)("refuses the setup script a write to the repository's .git/config", () => {
		const { run } = scaffold('echo "[core]" >> .git/config\n')
		expect(run).toThrow()
	})

	it.skipIf(!sandboxStarts)(
		'fails the scaffold, with the marker, when the setup script writes outside the workspace',
		() => {
			const { outside, run } = scaffold('echo escaped > "$OUTSIDE/escaped.txt"\n')
			let said = ''
			try {
				run()
			} catch (error) {
				said = String((error as { stderr?: string }).stderr)
			}
			expect(said).toContain(setupFailedMarker)
			expect(existsSync(join(outside, 'escaped.txt'))).toBe(false)
		},
	)
})

describe('pluginEvalRows setup failures (R156, E-CC-H12)', () => {
	it('reads a scaffold that failed in the setup script as a setup failure, with its output', () => {
		const rows = pluginEvalRows(
			{
				cases: [
					{
						name: 'two-prs',
						arms: {
							with: [
								{
									error: `scaffold failed (exit 3): preparing no such branch: main ${setupFailedMarker} `,
									graders: [],
								},
							],
						},
					},
				],
			},
			plan(),
			{ with: 'with-skill' },
		) as { response: { error: string; metadata: Record<string, unknown> } }[]
		expect(rows[0]?.response.error).toBe('setup script failed: preparing no such branch: main')
		expect(rows[0]?.response.metadata['setupFailed']).toEqual({ text: 'preparing no such branch: main' })
	})
})

/** A fake `claude plugin eval` result (E-CC-H9): every case passes with the skill, and fails without it. */
function fakePluginEval(calls: string[][]): PluginEvalRun {
	return async (args, _output) => {
		calls.push(args)
		const target = args[0] as string
		const tag = args[args.indexOf('--tag') + 1]
		const twoArms = args[args.indexOf('--ablation') + 1] === 'with-without'
		const root = join(target, pluginEvalDir)
		const cases = execFileSync('ls', [root], { encoding: 'utf8' })
			.trim()
			.split('\n')
			.map((name) => parse(readFileSync(join(root, name, 'case.yaml'), 'utf8')))
			.filter((item) => item.tags.includes(tag))
		const run = (pass: boolean, item: { execution: { prompt: string }; graders: { name: string }[] }) => ({
			error: null,
			costUsd: 0.01,
			graders: item.graders
				.filter((g) => pass || g.name !== 'fired')
				.map((g) => ({
					name: g.name,
					passed: g.name === 'fired' ? !/review|commit|summarize/.test(item.execution.prompt) : pass,
				})),
		})
		const result = {
			schemaVersion: 1,
			cases: cases.map((item) => ({
				name: item.name,
				arms: {
					with: [0, 1, 2].map(() => run(!target.endsWith('plugin-baseline'), item)),
					...(twoArms ? { without: [0, 1, 2].map(() => run(false, item)) } : {}),
				},
			})),
		}
		return { output: result }
	}
}

describe('runPluginEvalTest', () => {
	it('stops with a sandbox problem, running no case, when a setup script cannot be contained (R157)', async () => {
		const skill = goodSkill({
			'evals/evals.yaml':
				'outcome:\n  - { id: two-prs, prompt: write the notes, setup: setup/two-prs.sh }\nrubrics:\n  C1:\n    - contains: x\n  C2:\n    - contains: x\n',
			'evals/setup/two-prs.sh': 'true\n',
		})
		const planned = planTest(skill, { threads: 8 })
		if ('problem' in planned) throw new Error(planned.problem)
		const calls: string[][] = []
		const ran = await runPluginEvalTest({
			plan: planned.plan,
			skill,
			skillName: 'release-notes',
			verification: 'v',
			at: '2026-11-15T00:00:00.000Z',
			run: fakePluginEval(calls),
			scriptSandbox: async () => ({ problem: 'the script sandbox cannot start: bwrap missing' }),
		})
		expect(ran).toEqual({ code: 'sandbox', problem: 'the script sandbox cannot start: bwrap missing' })
		expect(calls).toEqual([])
	})

	it('in a folder-only test, needs no script sandbox for a setup script, and records sandbox none (#302)', async () => {
		const skill = goodSkill({
			'evals/evals.yaml':
				'outcome:\n  - { id: two-prs, prompt: write the notes, setup: setup/two-prs.sh }\nrubrics:\n  C1:\n    - contains: x\n  C2:\n    - contains: x\n',
			'evals/setup/two-prs.sh': 'true\n',
		})
		const planned = planTest(skill, { threads: 8 })
		if ('problem' in planned) throw new Error(planned.problem)
		const calls: string[][] = []
		let asked = false
		const ran = await runPluginEvalTest({
			plan: planned.plan,
			skill,
			skillName: 'release-notes',
			verification: 'v',
			at: '2026-11-15T00:00:00.000Z',
			run: fakePluginEval(calls),
			scriptSandbox: async () => {
				asked = true
				return { problem: 'the script sandbox cannot start: bwrap missing' }
			},
			sandbox: shippedSandbox('folder-only'),
		})
		expect(asked).toBe(false)
		expect(calls.length).toBeGreaterThan(0)
		expect('result' in ran && ran.result.sandbox).toBe('none')
	})

	it('runs triggers with one arm and outcomes beside the no-plugin arm, giving the result a promptfoo run gives', async () => {
		const skill = goodSkill()
		const calls: string[][] = []
		const options = {
			plan: plan(),
			skill,
			skillName: 'release-notes',
			verification: 'v',
			at: '2026-11-12T00:00:00.000Z',
		}
		const ran = await runPluginEvalTest({ ...options, run: fakePluginEval(calls) })
		if ('problem' in ran) throw new Error(ran.problem)
		expect(calls.map((args) => [args[args.indexOf('--tag') + 1], args[args.indexOf('--ablation') + 1]])).toEqual([
			['trigger', 'none'],
			['outcome', 'with-without'],
		])
		expect(calls[0]).toEqual(expect.arrayContaining(['--trust-plugin', '--scaffold', '--no-publish', '--json']))
		expect(ran.result.criteria).toEqual([
			{ id: 'C1', status: 'pass', passed: 3, ran: 3, baseline: { passed: 0, ran: 3 } },
			{ id: 'C2', status: 'pass', passed: 3, ran: 3, baseline: { passed: 0, ran: 3 } },
		])
		expect(ran.result.cases.every((item) => item.status === 'pass')).toBe(true)
		expect(ran.result).toMatchObject({ version: 1, baseline: 'without the skill', cost: 0.24, totalRuns: 24 })

		// The same keys as a promptfoo run's result.
		const promptfoo = await runTest({
			...options,
			sandbox: shippedSandbox('claude-code'),
			run: async () => ({ output: { results: { results: [] } } }),
		})
		if ('problem' in promptfoo) throw new Error(promptfoo.problem)
		const keys = (value: object) =>
			Object.keys(value)
				.filter((key) => key !== 'cost')
				.sort()
		expect(keys(ran.result)).toEqual(keys(promptfoo.result))
	})

	it('runs the baseline as a second suite on the plugin copy without the skill when the skill is in a plugin (R91)', async () => {
		const skill = goodSkill()
		const { mkdirSync, writeFileSync } = await import('node:fs')
		const pluginRoot = join(skill.folder, '..')
		mkdirSync(join(pluginRoot, '.claude-plugin'), { recursive: true })
		writeFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), '{"name":"notes-kit","skills":"./"}')
		const calls: string[][] = []
		const ran = await runPluginEvalTest({
			plan: plan(),
			skill,
			skillName: 'release-notes',
			verification: 'v',
			at: 'now',
			run: fakePluginEval(calls),
		})
		if ('problem' in ran) throw new Error(ran.problem)
		expect(calls.map((args) => [args[0]?.split('/').pop(), args[args.indexOf('--ablation') + 1]])).toEqual([
			['plugin-with', 'none'],
			['plugin-with', 'none'],
			['plugin-baseline', 'none'],
		])
		expect(ran.result.criteria[0]?.baseline).toEqual({ passed: 0, ran: 3 })
	})

	it('stops before any run when the plugin declares dependencies, which claude plugin eval cannot load (E-CC-H11)', async () => {
		const skill = goodSkill()
		const { mkdirSync, writeFileSync } = await import('node:fs')
		const pluginRoot = join(skill.folder, '..')
		mkdirSync(join(pluginRoot, '.claude-plugin'), { recursive: true })
		writeFileSync(
			join(pluginRoot, '.claude-plugin', 'plugin.json'),
			'{"name":"notes-kit","skills":"./","dependencies":["cyber-agentkit"]}',
		)
		const calls: string[][] = []
		const ran = await runPluginEvalTest({
			plan: plan(),
			skill,
			skillName: 'release-notes',
			verification: 'v',
			at: 'now',
			run: fakePluginEval(calls),
		})
		expect(ran).toMatchObject({ code: 'dependency-unsupported' })
		expect('problem' in ran && ran.problem).toContain('notes-kit depends on cyber-agentkit')
		expect(calls).toEqual([])
	})

	it('stops before any run when the plugin does not load', async () => {
		const calls: string[][] = []
		const ran = await runPluginEvalTest({
			plan: plan(),
			skill: goodSkill(),
			skillName: 'release-notes',
			verification: 'v',
			at: 'now',
			run: fakePluginEval(calls),
			listPlugins: async (folders) => ({
				plugins: folders.map((installPath) => ({ installPath, enabled: false, errors: ['broken manifest'] })),
			}),
		})
		expect(ran).toEqual({ code: 'plugin-load', problem: 'skill-test does not load: broken manifest' })
		expect(calls).toEqual([])
	})

	it('answers the problem when claude plugin eval writes no result', async () => {
		const ran = await runPluginEvalTest({
			plan: plan(),
			skill: goodSkill(),
			skillName: 'release-notes',
			verification: 'v',
			at: 'now',
			run: async () => ({ problem: 'plugin eval is currently unavailable' }),
		})
		expect(ran).toEqual({ problem: 'claude plugin eval did not run: plugin eval is currently unavailable' })
	})
})
