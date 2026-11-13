import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { CliError, type Format, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { type HarnessId, harnessIds } from '../harness/harness-id.js'
import { findRoot, type ReferencePlugin, referenceLayers } from '../references/reference-layers.js'
import { loadAspect } from '../skill-design/skill-aspects.js'
import { type PromptfooRun, runPromptfoo } from '../skill-design/skill-test.js'
import { skillTestHarness, skillTestHarnesses } from '../skill-design/skill-test-harness.js'
import { plannedRuns } from '../skill-design/test-progress.js'
import { defaultCasesPath, planCases, readCases } from './instruction-cases.js'
import {
	type CompareResult,
	comparePlanLine,
	compareResultsFolder,
	readLatestCompare,
	runCompare,
	saveCompare,
} from './instruction-compare.js'
import { comparisonName, readWording, type Wording } from './wording.js'

export type InstructionCommandOptions = {
	plugin?: ReferencePlugin | undefined
	/** How promptfoo runs; tests pass a fake. */
	runPromptfoo?: PromptfooRun | undefined
	/** How the progress file is polled and "still running" lines spaced; tests shorten them. */
	progress?: { heartbeatMs?: number | undefined; pollMs?: number | undefined } | undefined
	/** The machine's hardware threads, which bound how many runs go at once; tests set it. */
	threads?: number | undefined
}

function fail(code: string, problem: string, exit: number = exitCodes.error): never {
	process.stderr.write(`error: ${code}: ${problem}\n`)
	throw CliError.reported(exit)
}

const percent = (passed: number, ran: number) => (ran ? `${Math.round((passed / ran) * 100)}%` : '-')

/** The text report; `folder` is where the result was saved, so the replies file is named in full. */
export function compareText(result: CompareResult, folder?: string): string {
	const { A, B } = result.wordings
	const lines = [
		`${result.instruction}: ${result.runs} runs per case per wording, threshold ${result.threshold}, cases ${result.cases}`,
		`A: ${A.source} (${A.sha256})`,
		`B: ${B.source} (${B.sha256})`,
	]
	for (const item of result.criteria) {
		if (item.status === 'not-tested') {
			lines.push(`${item.id}: not tested — ${item.reason}`)
			continue
		}
		const a = item.A ?? { passed: 0, ran: 0 }
		const b = item.B ?? { passed: 0, ran: 0 }
		const won = item.winner === undefined ? 'undecided' : item.winner === 'tie' ? 'tie' : `${item.winner} wins`
		lines.push(
			`${item.id}: A ${a.passed} of ${a.ran} (${percent(a.passed, a.ran)}), B ${b.passed} of ${b.ran} (${percent(b.passed, b.ran)}): ${won} — ${item.statement}`,
		)
		for (const arm of ['A', 'B'] as const)
			for (const failure of item.failures?.[arm] ?? [])
				lines.push(
					`  ${arm} ${failure.case} run ${failure.run}: ${failure.output.split('\n').slice(0, 3).join(' ').slice(0, 200)}`,
				)
	}
	for (const item of result.notRun) lines.push(`not run: ${item.case} — ${item.reason}`)
	for (const item of result.blocked ?? [])
		lines.push(
			`blocked: ${item.case} run ${item.run} (${item.arm}) tried to ${item.what === 'network' ? 'reach' : item.what} ${item.target}`,
		)
	const { score } = result
	lines.push(
		result.winner === 'none'
			? 'winner: none, no criterion was decided in both wordings'
			: `winner: ${result.winner === 'tie' ? 'tie' : result.winner} (A won ${score.A}, B won ${score.B}, ${score.tie} tied)`,
	)
	if (result.replies) lines.push(`replies of every run: ${folder ? join(folder, result.replies) : result.replies}`)
	return `${lines.join('\n')}\n`
}

/** The folder results and default cases live under: the repository root, or the home folder outside a repository. */
function base(rootOption: string | undefined, home: string): string {
	const root = rootOption === undefined ? findRoot(process.cwd()) : resolve(rootOption)
	return existsSync(join(root, '.git')) ? root : home
}

function compareCommand({
	plugin,
	runPromptfoo: run = runPromptfoo,
	progress,
	threads,
}: InstructionCommandOptions): cli.Command {
	return command({
		name: 'compare',
		description:
			"Compare two wordings of an always-loaded instruction: run the same outcome cases with each one loaded as the project instruction file (`CLAUDE.md` on Claude Code, `AGENTS.md` on Codex), several runs per case, each in a fresh folder, and save each criterion's pass rate per wording and the winner. Makes model calls unless `--plan` is given.",
		arguments: [
			{
				name: 'a',
				description:
					'Wording A: a file, or a section of one as `<file>#<heading>`, such as `AGENTS.md#Commit Discipline`.',
				type: t.string(),
			},
			{ name: 'b', description: 'Wording B, named the same way.', type: t.string() },
		],
		options: {
			cases: {
				description:
					"The cases file. Defaults to `.agents/instruction-design/cases/<name>.yaml` under the root, where `<name>` is wording A's heading anchor, else its file name.",
				type: t.string().optional(),
			},
			runs: {
				description: "Runs per case per wording, in place of the cases file's `runs` (3 by default).",
				type: t.number().optional(),
			},
			name: {
				description:
					'The name the default cases file and the results go under, in place of the one taken from wording A.',
				type: t.string().optional(),
			},
			plan: {
				description: 'Print how many runs the comparison makes, and start none.',
				type: t.boolean().optional(),
			},
			harness: {
				description: `The harness each run drives: ${skillTestHarnesses.join(' or ')}. Defaults to claude-code.`,
				type: t.string().optional(),
			},
			model: {
				description: "The model each run uses. Defaults to the harness's default.",
				type: t.string().optional(),
			},
			judge: {
				description: 'The model that decides `judge` rubrics. Without it, those criteria are not tested.',
				type: t.string().optional(),
			},
			root: {
				description:
					'The repository root cases and results are found under. Defaults to the nearest folder holding `.git`.',
				type: t.string().optional(),
			},
		},
		examples: [
			{
				command: "cyber-agentkit instruction compare 'AGENTS.md#Commit Discipline' drafts/commit-discipline.md",
				description: 'Compare a section of AGENTS.md with a new wording of it',
			},
			{
				command: "cyber-agentkit instruction compare 'AGENTS.md#Commit Discipline' drafts/commit-discipline.md --plan",
				description: 'Say how many runs it makes, without starting',
			},
			{
				command: 'cyber-agentkit instruction compare a.md b.md --cases evals/delegation.yaml --runs 5',
				description: 'Compare two files on a named cases file, five runs each',
			},
		],
		async run(
			this: { format: Format; ui?: { displayLevel?: string } },
			args: {
				a: string
				b: string
				cases?: string | undefined
				runs?: number | undefined
				name?: string | undefined
				plan?: boolean | undefined
				harness?: string | undefined
				model?: string | undefined
				judge?: string | undefined
				root?: string | undefined
			},
		) {
			if (args.runs !== undefined && (!Number.isInteger(args.runs) || args.runs < 1))
				fail('bad-runs', '--runs is not a positive whole number', exitCodes.usage)
			const wordings: Wording[] = []
			for (const source of [args.a, args.b]) {
				const read = readWording(source, process.cwd())
				if ('problem' in read) fail(read.code, read.problem)
				wordings.push(read)
			}
			const [a, b] = wordings as [Wording, Wording]
			const harnessId = args.harness ?? 'claude-code'
			if (!(harnessIds as readonly string[]).includes(harnessId))
				fail(
					'unknown-harness',
					`no harness ${harnessId}; instruction compare drives ${skillTestHarnesses.join(', ')}`,
					exitCodes.usage,
				)
			const harness = skillTestHarness(harnessId as HarnessId, args.model)
			if ('problem' in harness) fail('unsupported-harness', harness.problem, exitCodes.usage)
			const home = homedir()
			const where = base(args.root, home)
			const display = (path: string) => collapseHome(home, path)
			const name = args.name ?? comparisonName(a)
			const casesPath = args.cases === undefined ? defaultCasesPath(where, name) : resolve(args.cases)
			const casesShown = args.cases ?? display(casesPath)
			const cases = readCases(casesPath, casesShown)
			if ('problem' in cases) fail(cases.code, cases.problem)
			const planned = planCases(cases, { judge: args.judge, runs: args.runs, threads, display: casesShown })
			if ('problem' in planned) fail(planned.code, planned.problem)
			for (const warning of planned.warnings) process.stderr.write(`warning: ${warning}\n`)
			const resultFolder = compareResultsFolder(where, name)
			const line = comparePlanLine(planned.plan, readLatestCompare(resultFolder))
			if (args.plan)
				return result(
					{
						instruction: name,
						cases: casesShown,
						totalRuns: plannedRuns(planned.plan),
						caseCount: planned.plan.cases.length,
						runs: planned.plan.runs,
						concurrency: planned.plan.concurrency,
						wordings: { A: a.source, B: b.source },
					},
					{ render: { text: () => `${line}\n` } },
				)
			const layers = await referenceLayers({
				root: args.root,
				cwd: process.cwd(),
				home,
				platform: process.platform,
				env: process.env,
				plugin,
			})
			const verification = loadAspect('skill-design.aspects.verification', layers, display)
			// Progress goes to stderr, never into the result, and `--silent` turns it off.
			const report =
				this.ui?.displayLevel === 'none' ? undefined : (text: string) => void process.stderr.write(`${text}\n`)
			report?.(line)
			const ran = await runCompare({
				plan: planned.plan,
				instruction: name,
				cases: casesShown,
				statements: cases.cases.criteria,
				wordings: { A: a, B: b },
				model: args.model,
				judge: args.judge,
				verification: `${verification.name} from ${verification.implementation}`,
				at: new Date().toISOString(),
				harness,
				run,
				progress: report ? { ...progress, write: report } : undefined,
			})
			if ('problem' in ran) fail(('code' in ran && ran.code) || 'promptfoo-failed', ran.problem)
			for (const warning of ran.warnings) process.stderr.write(`warning: ${warning}\n`)
			const saved = saveCompare(resultFolder, ran.result, ran.replies)
			return result(saved, { render: { text: () => compareText(saved, resultFolder) } })
		},
	})
}

/** `instruction`: the commands `/instruction` runs without an agent. */
export function createInstructionCommand(options: InstructionCommandOptions = {}): cli.Command {
	return command({
		name: 'instruction',
		description:
			'Measure an always-loaded instruction, such as an AGENTS.md section, by running it: compare two wordings of it on the same cases.',
		commands: [compareCommand(options)],
	})
}
