import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import {
	answerThenFail,
	type CommonArgs,
	compact,
	defaultOption,
	fail,
	type LayersFor,
	rootOption,
	traceOption,
	writeWarnings,
} from './reference-command-support.js'
import { parseReferenceName } from './reference-name.js'
import type { ReferenceWarning } from './reference-warning.js'
import { whereReference } from './reference-where.js'
import type { ReferenceTrace } from './resolve-reference.js'

export type ReferenceWhereOutput = {
	name: string
	status: string
	places: { scope: string; path: string; reaches: string; status: string; sections?: string[] }[]
	options?: string[]
	layers?: ReferenceTrace['layers']
	warnings?: ReferenceWarning[]
}

export function whereCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'where',
		description:
			'Give the project and user files a customization or a selection of a reference is written to, who each reaches, and the heading paths of the document below each.',
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
			trace: { ...traceOption, description: 'Add every layer checked, with its outcome.' },
		},
		async run(args: CommonArgs & { name: string; default: string | undefined; trace: boolean | undefined }) {
			const format = this.format
			try {
				const home = homedir()
				const display = (path: string) => collapseHome(home, path)
				const report = whereReference(args.name, await layersFor(args, home), {
					root: resolve(args.root ?? process.cwd()),
					display,
				})
				const output: ReferenceWhereOutput = compact({
					name: report.name,
					status: report.status,
					places: report.places.map((place) => compact(place)),
					options: report.options,
					layers: args.trace ? report.layers.map((layer) => ({ ...layer, path: display(layer.path) })) : undefined,
					warnings: report.warnings,
				})
				if (format === 'text') writeWarnings(report.warnings)
				const answer = result(output)
				if (report.status !== 'invalid') return answer
				process.stderr.write(`error: reference-invalid: ${parseReferenceName(args.name).invalid}\n`)
				return answerThenFail(answer, format)
			} catch (error) {
				return fail(error, 'Reference placement lookup failed.')
			}
		},
	})
}
