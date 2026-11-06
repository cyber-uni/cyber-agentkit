import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { document, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import type { ReferenceWarning } from './reference-codes.js'
import {
	asCliError,
	type CreateArgs,
	compact,
	displayTrace,
	givenRoot,
	inOption,
	type LayersFor,
	pluginOption,
	rootOption,
	scopeOption,
	skillOption,
	traceOption,
	traceText,
	writeWarnings,
} from './reference-command-support.js'
import { createContribution } from './reference-write.js'
import { validateWrite } from './reference-write-checks.js'
import type { ReferenceTrace } from './resolve-reference.js'

/** A write's report is informational (R38), except its `code` and `warnings`, which are contract (J25). */
export type ReferenceCreateReport = {
	path: string
	/** A project section's folder, relative to the root. */
	folder?: string
	hint: string
	content?: string
	hints?: string[]
	warnings?: ReferenceWarning[]
	trace?: ReferenceTrace
}

export function createCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'create',
		description:
			"Start a contribution in the repo or user tier, a folder's project section, or a plugin's or a skill's source folder, from a template or an interface. Never overwrites a file with a body; writes a file a contribution above hides, with a warning.",
		arguments: [{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() }],
		options: {
			root: rootOption,
			scope: scopeOption,
			in: inOption,
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
					"Interface id to implement: the interface's sections become `##` headings, each stubbed `**Unsupported.**` with what it holds, and `merge: replace`; with --in, a project section with neither. Not with --template.",
				type: t.string().optional(),
			},
			'dry-run': {
				description: 'Print the target path and the exact content, and write nothing.',
				type: t.boolean().optional(),
			},
			trace: { ...traceOption, description: 'After the write, add the trace, in which the new file applies.' },
		},
		examples: [
			{ command: 'cyber-agentkit reference create my-topic', description: 'Start a new reference named my-topic' },
		],
		async run(args: CreateArgs) {
			const format = this.format
			try {
				const home = homedir()
				const display = (path: string) => collapseHome(home, path)
				const request = {
					root: givenRoot(args.root),
					home,
					name: args.name,
					scope: args.scope,
					in: args.in,
					plugin: args.plugin,
					default: args.default,
					merge: args.merge,
					template: args.template,
					implements: args.implements,
					dryRun: args['dry-run'],
				}
				// A usage error comes before anything is read, `root-missing` included (C3).
				validateWrite({ command: 'create', ...request })
				const layers = await layersFor({ root: args.root, default: args.default }, home)
				const created = createContribution(layers, { ...request, root: layers.root ?? request.root }, { display })
				const report: ReferenceCreateReport = compact({
					path: display(created.path),
					folder: created.folder,
					hint: created.dryRun
						? 'Nothing was written. Run again without --dry-run to write it.'
						: `Run \`load ${created.name}\` for the composed document.`,
					content: created.dryRun ? created.content : undefined,
					hints: created.hints,
					warnings: created.warnings,
					trace: args.trace && created.after ? displayTrace(created.after.trace, home) : undefined,
				})
				if (format !== 'text') return result(report)
				writeWarnings(created.warnings)
				for (const hint of created.hints) process.stderr.write(`hint: ${hint}\n`)
				if (args.trace && created.after) process.stderr.write(traceText(created.after, home))
				return document(created.dryRun ? `${report.path}\n\n${created.content}` : `${report.path}\n\n${report.hint}\n`)
			} catch (error) {
				return asCliError(error, 'Reference creation failed.')
			}
		},
	})
}
