import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { checkReferences } from './reference-check.js'
import {
	answerThenFail,
	type CommonArgs,
	compact,
	fail,
	type LayersFor,
	rootOption,
	traceOption,
} from './reference-command-support.js'

export type ReferenceCheckReport = {
	failed?: { name: string; loadedBy?: string; failures: { check: string; message: string }[] }[]
	passed: number
	references?: {
		name: string
		loadedBy?: string
		kind: string
		status: string
		failures?: { check: string; message: string }[]
		unsupported?: string[]
	}[]
}

export function checkCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'check',
		description:
			'Check interface documents and their implementations, each composed as `show` composes it. With no names, checks every one found. Exits 1 on any failure.',
		arguments: [
			{
				name: 'names',
				description: 'Reference names, without the `.md` extension; `<plugin>/<name>` builds that plugin’s own stack.',
				type: t.array(t.string()).optional(),
			},
		],
		options: {
			root: rootOption,
			trace: { ...traceOption, description: 'Add every entry checked, with its kind and unsupported sections.' },
		},
		async run(args: CommonArgs & { names?: string[] | undefined; trace: boolean | undefined }) {
			const format = this.format
			try {
				const home = homedir()
				const entries = checkReferences(await layersFor(args, home), {
					names: args.names ?? [],
					display: (path) => collapseHome(home, path),
				})
				const failing = entries.filter((entry) => entry.status !== 'passed')
				const strip = (failures: { check: string; message: string }[]) =>
					failures.map(({ check, message }) => ({ check, message }))
				const report: ReferenceCheckReport = compact({
					failed: failing.map(({ name, loadedBy, failures }) => compact({ name, loadedBy, failures: strip(failures) })),
					passed: entries.length - failing.length,
					references: args.trace
						? entries.map(({ name, loadedBy, kind, status, failures, unsupported }) =>
								compact({ name, loadedBy, kind, status, failures: strip(failures), unsupported }),
							)
						: undefined,
				})
				const answer = result(report)
				if (!failing.length) return answer
				if (format === 'text') {
					process.stderr.write(
						`error: interface-check: ${failing.length} of ${entries.length} references fail their check.\n`,
					)
				}
				return answerThenFail(answer, format)
			} catch (error) {
				return fail(error, 'Reference check failed.')
			}
		},
	})
}
