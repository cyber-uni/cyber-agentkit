import { exitCodes, t } from 'clibuilder'
import { type Answer, CliError, type Format, isCliError, printAnswer } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { type ReferenceLayers, type ReferencePlugin, referenceLayers } from './reference-layers.js'
import type { ReferenceWarning } from './reference-warning.js'
import { ReferenceWriteError } from './reference-write.js'
import type { ReferenceTrace, ResolvedReference } from './resolve-reference.js'

type StringOption = { description: string; type: ReturnType<ReturnType<typeof t.string>['optional']> }
type BooleanOption = { description: string; type: ReturnType<ReturnType<typeof t.boolean>['optional']> }

export type CommonArgs = { root: string | undefined }

export const rootOption: StringOption = {
	description:
		'Directory the project tier is read from, and each folder above it up to the repository root; a project write goes to its `.agents/references/`. Defaults to the current directory.',
	type: t.string().optional(),
}

export const traceOption: BooleanOption = {
	description: 'Add the trace: every layer checked, with its outcome, and how the result was built.',
	type: t.boolean().optional(),
}

export const defaultOption: StringOption = {
	description: "The calling skill's folder: its `references/<name>.default.md` joins as the `default` tier.",
	type: t.string().optional(),
}

export type LayersFor = (args: CommonArgs & { default?: string | undefined }, home: string) => Promise<ReferenceLayers>

export function layerSource(plugin: ReferencePlugin | undefined): LayersFor {
	return (args, home) =>
		referenceLayers({
			root: args.root ?? process.cwd(),
			home,
			platform: process.platform,
			env: process.env,
			plugin,
			defaultSkill: args.default,
		})
}

/** A field with nothing to say is left out: `undefined`, an empty string, or an empty list. */
export function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(
			([, field]) => field !== undefined && field !== '' && !(Array.isArray(field) && !field.length),
		),
	) as T
}

/** stderr, not stdout: an agent parses stdout. Rethrows what the cli already reports. */
export function fail(error: unknown, fallback: string): never {
	if (isCliError(error)) throw error
	if (error instanceof ReferenceWriteError) {
		process.stderr.write(`error: ${error.code}: ${error.message}\n`)
		throw CliError.reported(error.usage ? exitCodes.usage : exitCodes.error)
	}
	process.stderr.write(`error: ${error instanceof Error ? error.message : fallback}\n`)
	throw CliError.reported(exitCodes.error)
}

export function usage(message: string): never {
	process.stderr.write(`error: usage: ${message}\n`)
	throw CliError.reported(exitCodes.usage)
}

/** An answer with a failing exit code: the cli prints only what a returned answer holds, so print it first. */
export function answerThenFail(answer: Answer<any>, format: Format): never {
	const text = printAnswer(answer, format)
	if (text !== undefined) process.stdout.write(text)
	throw CliError.reported(exitCodes.error)
}

export function writeWarnings(warnings: readonly ReferenceWarning[]): void {
	for (const { code, message } of warnings) process.stderr.write(`warning: ${code}: ${message}\n`)
}

export function displayTrace(trace: ReferenceTrace, home: string): ReferenceTrace {
	const show = (path: string) => collapseHome(home, path)
	return {
		...trace,
		contributions: trace.contributions.map((row) => ({ ...row, path: show(row.path) })),
		layers: trace.layers.map((layer) => ({ ...layer, path: show(layer.path) })),
	}
}

/** The text trace: a summary line, then each section with its contributions, then each layer. */
export function traceText(resolved: ResolvedReference, home: string): string {
	const trace = displayTrace(resolved.trace, home)
	const lines = [
		`${resolved.name}: ${resolved.status}; stack: ${trace.stack.join(' → ') || 'none'}; built by ${trace.builtBy}; harnesses: ${trace.harnesses.join(', ') || 'none detected'}`,
	]
	if (resolved.message) lines.push(`  ${resolved.message}`)
	if (trace.sections.length) {
		lines.push('sections:')
		for (const section of trace.sections) {
			const how = section.removedBy
				? `removed by ${section.removedBy}`
				: section.contributions.map(({ contribution, operation }) => `${contribution} (${operation})`).join(', ') ||
					'no text'
			lines.push(`  ${section.path}: ${how}`)
		}
	}
	lines.push('layers:')
	for (const layer of trace.layers) {
		const who = layer.plugin ? ` ${layer.plugin}` : layer.skill ? ` ${layer.skill}` : ''
		const how = layer.operation ? `; ${layer.operation} from ${layer.operationFrom}` : ''
		const extendsNote = layer.extendsOutcome ? `; extends ${layer.extendsOutcome}` : ''
		const selection = layer.selection ? '; selection' : ''
		const frontmatter =
			layer.frontmatter && Object.keys(layer.frontmatter).length ? ` ${JSON.stringify(layer.frontmatter)}` : ''
		lines.push(`  ${layer.tier}${who} ${layer.path}: ${layer.outcome}${how}${extendsNote}${selection}${frontmatter}`)
	}
	return `${lines.join('\n')}\n`
}

/** A name not found, for a person: the name, why, and, when ambiguous, the options `reference select` takes. */
export function errorText(entry: ResolvedReference): string {
	const options = entry.options?.length ? `; options: ${entry.options.join(', ')}` : ''
	return `${entry.name}: ${entry.message}${options}`
}

export const scopeOption: StringOption = {
	description: 'Tier to write: project (default), `.agents/references/` at the root, or user, `~/.agents/references/`.',
	type: t.string().optional(),
}

export const pluginOption: StringOption = {
	description: "A plugin's source folder in this repository: acts on its `references/<name>.md`.",
	type: t.string().optional(),
}

export const skillOption: StringOption = {
	description: "A skill's source folder in this repository: acts on its `references/<name>.default.md`.",
	type: t.string().optional(),
}

export type CreateArgs = CommonArgs & {
	name: string
	scope: string | undefined
	plugin: string | undefined
	default: string | undefined
	merge: string | undefined
	template: string | undefined
	implements: string | undefined
	'dry-run': boolean | undefined
	trace: boolean | undefined
}
