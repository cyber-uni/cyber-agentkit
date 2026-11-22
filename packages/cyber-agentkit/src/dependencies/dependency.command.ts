import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { CliError, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { isHarnessId, unknownHarnessMessage } from '../detection/declared-harnesses.js'
import { detectHarness } from '../detection/detect-harness.js'
import { harnessIds } from '../harness/harness-id.js'
import {
	type CheckedDependency,
	checkPluginDependencies,
	type DependencyProblem,
	type DependencyState,
} from './plugin-dependencies.js'

/** `dependency doctor`'s answer. `harness`, `supported`, `autoResolved`, and `research` are informational. */
export type DependencyDoctorReport = {
	/** `ready` when there is no problem; each problem is listed in `problems` with its code. */
	status: 'ready' | 'not-ready'
	plugin: string
	harness: string
	supported: boolean
	autoResolved: boolean
	declaringMarketplace?: string
	/** One entry per declared dependency, or a sentence saying the plugin declares none. */
	dependencies: { name: string; marketplace?: string; version?: string; state: DependencyState; id?: string }[] | string
	problems?: DependencyProblem[]
	steps?: string[]
	research: readonly string[]
}

function usage(message: string): never {
	throw new CliError(message, {
		code: 'invalid-usage',
		exitCode: exitCodes.usage,
		help: 'Run `cyber-agentkit dependency doctor --help` for the options.',
	})
}

const entry = ({ name, marketplace, version, state, id }: CheckedDependency) => ({
	name,
	...(marketplace && { marketplace }),
	...(version && { version }),
	state,
	...(id && { id }),
})

function doctorCommand(): cli.Command {
	return command({
		name: 'doctor',
		description:
			"Examine whether a plugin's dependencies are ready on the running harness: each dependency the plugin declares with its state (enabled, installed, disabled, missing, or unknown), every problem with its code, and the steps to run, in order. A bare name matches only in the declaring plugin's marketplace, the one it is installed from; when that is not known, it is unknown. Changes nothing: it never installs, enables, or removes a plugin. Exits 0 whenever it answers, with each problem as a status in the result; exits 1 when no single harness is detected and none is given.",
		options: {
			plugin: {
				description: 'The plugin root whose manifests declare the dependencies. Defaults to the current directory.',
				type: t.string().optional(),
			},
			harness: {
				description: `The harness to examine, instead of the one detected running: ${harnessIds.join(', ')}.`,
				type: t.string().optional(),
			},
		},
		examples: [
			{ command: 'cyber-agentkit dependency doctor', description: "Examine the current folder's plugin" },
			{
				command: 'cyber-agentkit dependency doctor --plugin ./my-plugin --harness codex',
				description: "Examine a plugin's dependencies on Codex",
			},
		],
		async run(args: { plugin?: string | undefined; harness?: string | undefined }) {
			const pluginRoot = resolve(args.plugin ?? process.cwd())
			if (!statSync(pluginRoot, { throwIfNoEntry: false })?.isDirectory())
				usage(`--plugin "${args.plugin}" is not a folder.`)
			if (args.harness !== undefined && !isHarnessId(args.harness)) usage(unknownHarnessMessage(args.harness))
			const harness = args.harness ?? detectHarness().harness
			if (harness === 'unknown' || !isHarnessId(harness))
				throw new CliError('No single harness is detected running here, so no dependency can be examined.', {
					code: 'harness-not-detected',
					exitCode: exitCodes.error,
					help: `Pass --harness <id> to name the harness to examine: ${harnessIds.join(', ')}.`,
				})
			const check = await checkPluginDependencies(harness, { pluginRoot })
			const report: DependencyDoctorReport = {
				status: check.problems.length ? 'not-ready' : 'ready',
				plugin: collapseHome(homedir(), pluginRoot),
				harness,
				supported: check.supported,
				autoResolved: check.autoResolved,
				...(check.declaringMarketplace && { declaringMarketplace: check.declaringMarketplace }),
				dependencies: check.dependencies.length
					? check.dependencies.map(entry)
					: 'none: the plugin declares no dependencies',
				...(check.problems.length && { problems: [...check.problems] }),
				...(check.steps.length && { steps: [...check.steps] }),
				research: check.research,
			}
			return result(report)
		},
	})
}

/** `dependency`: examine the plugins a plugin declares it needs. */
export function createDependencyCommand(): cli.Command {
	return command({
		name: 'dependency',
		description:
			'Examine the plugins a plugin declares it needs: `doctor` reports whether each is installed and enabled on the running harness, and the steps that make the plugin ready. Never installs anything.',
		commands: [doctorCommand()],
	})
}
