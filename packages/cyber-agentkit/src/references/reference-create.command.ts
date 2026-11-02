import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { document, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import {
	asCliError,
	type CreateArgs,
	compact,
	displayTrace,
	type LayersFor,
	pluginOption,
	rootOption,
	scopeOption,
	skillOption,
	traceOption,
	traceText,
} from './reference-command-support.js'
import { createContribution } from './reference-write.js'
import type { ReferenceTrace } from './resolve-reference.js'

/** The fields of `create`, `select`, and `delete` are not a contract yet (spec Q4). */
export type ReferenceCreateReport = {
	path: string
	hint: string
	content?: string
	hints?: string[]
	trace?: ReferenceTrace
}

export function createCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'create',
		description:
			"Start a contribution in the repo or user tier, or in a plugin's or a skill's source folder, from a template or an interface. Never overwrites a file with a body.",
		arguments: [{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() }],
		options: {
			root: rootOption,
			scope: scopeOption,
			plugin: pluginOption,
			default: skillOption,
			merge: {
				description:
					'How it applies over what is below: replace, patch (default), combine, or remove. remove writes no body.',
				type: t.string().optional(),
			},
			template: {
				description:
					'File whose text is written as it is, frontmatter included. Defaults to a built-in template of top-level `##` sections.',
				type: t.string().optional(),
			},
			implements: {
				description:
					"Interface id to implement: the interface's sections become `##` headings, each stubbed `**Unsupported.**`, with `merge: replace`. Not with --template.",
				type: t.string().optional(),
			},
			'dry-run': {
				description: 'Print the target path and the exact content, and write nothing.',
				type: t.boolean().optional(),
			},
			trace: { ...traceOption, description: 'After the write, add the trace, in which the new file applies.' },
		},
		async run(args: CreateArgs) {
			const format = this.format
			try {
				const home = homedir()
				const display = (path: string) => collapseHome(home, path)
				const layers = await layersFor({ root: args.root, default: args.default }, home)
				const root = layers.root ?? resolve(args.root ?? process.cwd())
				const created = createContribution(
					layers,
					{
						root,
						home,
						name: args.name,
						scope: args.scope,
						plugin: args.plugin,
						default: args.default,
						merge: args.merge,
						template: args.template,
						implements: args.implements,
						dryRun: args['dry-run'],
					},
					{ display },
				)
				const report: ReferenceCreateReport = compact({
					path: display(created.path),
					hint: created.dryRun
						? 'Nothing was written. Run again without --dry-run to write it.'
						: `Run \`load ${created.name}\` for the composed document.`,
					content: created.dryRun ? created.content : undefined,
					hints: created.hints,
					trace: args.trace && created.after ? displayTrace(created.after.trace, home) : undefined,
				})
				if (format !== 'text') return result(report)
				for (const hint of created.hints) process.stderr.write(`hint: ${hint}\n`)
				if (args.trace && created.after) process.stderr.write(traceText(created.after, home))
				return document(created.dryRun ? `${report.path}\n\n${created.content}` : `${report.path}\n\n${report.hint}\n`)
			} catch (error) {
				return asCliError(error, 'Reference creation failed.')
			}
		},
	})
}
