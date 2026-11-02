import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { document, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	type LayersFor,
	rootOption,
	scopeOption,
	writeWarnings,
} from './reference-command-support.js'
import { describeAnswer, selectContribution } from './reference-write.js'

export type ReferenceSelectReport = {
	path: string
	/** `no-selection` when `--clear` found none: a no-op, exit 0. */
	code?: 'no-selection'
	message?: string
	extends?: string[]
	deleted?: boolean
	status: string
	stack?: string[]
	answer: string
}

export function selectCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'select',
		description:
			'Choose what a name builds on: write an `extends` listing the options, bottom first, in the project or user file. Its body and other keys are kept.',
		arguments: [
			{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() },
			{
				name: 'options',
				description: 'Bottom first: each a plugin holding the name (or `<plugin>/<name>`), or `default`.',
				type: t.array(t.string()).optional(),
			},
		],
		options: {
			root: rootOption,
			scope: scopeOption,
			clear: {
				description: 'Remove the selection; a file left with nothing in it is deleted.',
				type: t.boolean().optional(),
			},
		},
		async run(
			args: CommonArgs & {
				name: string
				options?: string[] | undefined
				scope: string | undefined
				clear: boolean | undefined
			},
		) {
			const format = this.format
			try {
				const home = homedir()
				const root = resolve(args.root ?? process.cwd())
				const display = (path: string) => collapseHome(home, path)
				const selected = selectContribution(
					await layersFor({ root }, home),
					{
						root,
						home,
						name: args.name,
						options: args.options ?? [],
						scope: args.scope,
						clear: args.clear,
					},
					{ display },
				)
				const report: ReferenceSelectReport = compact({
					path: display(selected.path),
					code: selected.code,
					message: selected.message,
					extends: selected.extends,
					deleted: selected.deleted || undefined,
					status: selected.after.status,
					stack: selected.after.trace.stack,
					answer: describeAnswer(selected.after, display),
				})
				if (format !== 'text') return result(report)
				writeWarnings(selected.after.warnings)
				if (selected.code) return document(`${report.path}\n\n${selected.code}: ${selected.message}\n`)
				const what = args.clear
					? selected.deleted
						? 'selection cleared; the file was left empty and deleted'
						: 'selection cleared'
					: `extends: [${selected.extends.join(', ')}]`
				return document(`${report.path}\n\n${what}. ${report.answer}\n`)
			} catch (error) {
				return asCliError(error, 'Reference selection failed.')
			}
		},
	})
}
