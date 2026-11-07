import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import type { ReferenceWarning } from './reference-codes.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	defaultOption,
	defaultReferencePath,
	givenRoot,
	inOption,
	type LayersFor,
	rootOption,
	traceOption,
	writeWarnings,
} from './reference-command-support.js'
import { type ReferenceWhereFile, whereReference } from './reference-where.js'
import type { ReferenceTrace } from './resolve-reference.js'

export type ReferenceWhereOutput = {
	name: string
	status: string
	files: ReferenceWhereFile[]
	headings?: string[]
	used?: string[]
	options?: string[]
	/** Informational: the plugins and default the stack uses are read-only (UC2.6). */
	hint?: string
	layers?: ReferenceTrace['layers']
	warnings?: ReferenceWarning[]
}

export function whereCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'where',
		description:
			"Give the repo and user files, and with --in a folder's project section, a customization or a selection of a reference is written to, who each reaches and what hides it, the main document's heading paths, and the read-only plugins and default the stack uses.",
		arguments: [
			{
				name: 'name',
				description: 'Reference name, without the `.md` extension.',
				type: t.string(),
			},
		],
		options: {
			root: rootOption,
			default: defaultOption,
			in: { ...inOption, description: "A folder strictly below the root: also give its project section's file." },
			trace: { ...traceOption, description: 'Add every layer checked, with its outcome.' },
		},
		examples: [{ command: `${path} where my-topic`, description: 'Show which layers hold my-topic' }],
		async run(
			args: CommonArgs & {
				name: string
				default: string | undefined
				in: string | undefined
				trace: boolean | undefined
			},
		) {
			const format = this.format
			try {
				const home = homedir()
				const display = (path: string) => collapseHome(home, path)
				const layers = await layersFor(args, home)
				const report = whereReference(args.name, layers, {
					root: layers.root ?? givenRoot(args.root),
					display,
					in: args.in,
				})
				const output: ReferenceWhereOutput = compact({
					name: report.name,
					status: report.status,
					files: report.files,
					headings: report.headings,
					used: report.used,
					options: report.options,
					hint: report.used.length
						? `${report.used.join(', ')} ${report.used.length === 1 ? 'is' : 'are'} read-only; a customization goes in one of the files.`
						: undefined,
					layers: args.trace ? report.layers.map((layer) => ({ ...layer, path: display(layer.path) })) : undefined,
					warnings: report.warnings,
				})
				if (format === 'text') writeWarnings(report.warnings)
				return result(output)
			} catch (error) {
				return asCliError(error, 'Reference placement lookup failed.')
			}
		},
	})
}
