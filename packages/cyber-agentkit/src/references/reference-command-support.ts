import { exitCodes, t } from 'clibuilder'
import { CliError, isCliError } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import type { ReferenceWarning } from './reference-codes.js'
import { ReferenceFailure } from './reference-error.js'
import { type ReferenceLayers, type ReferencePlugin, referenceLayers } from './reference-layers.js'
import type { ReferenceTrace, ResolvedReference } from './resolve-reference.js'

type StringOption = { description: string; type: ReturnType<ReturnType<typeof t.string>['optional']> }
type BooleanOption = { description: string; type: ReturnType<ReturnType<typeof t.boolean>['optional']> }

export type CommonArgs = { root: string | undefined }

export const rootOption: StringOption = {
	description:
		'The repository root: its `.agents/references/` is the repo tier, and its `package.json` names the dependency plugins. Defaults to the nearest folder at or above the current directory holding `.git`, else the current directory.',
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
			root: args.root,
			cwd: process.cwd(),
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

/**
 * A thrown failure as the one axi error value the cli prints on stdout: a `ReferenceFailure` keeps its
 * code and exits 1, or 2 for a usage error; a `CliError` passes through.
 */
export function asCliError(error: unknown, fallback: string): never {
	if (isCliError(error)) throw error
	if (error instanceof ReferenceFailure) {
		throw new CliError(error.message, {
			code: error.code,
			exitCode: error.usage ? exitCodes.usage : exitCodes.error,
			details: error.details,
			help: error.help,
		})
	}
	throw new CliError(error instanceof Error ? error.message : fallback, { cause: error })
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
		projectSections: trace.projectSections.map((row) => ({ ...row, path: show(row.path) })),
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
	if (trace.projectSections.length) {
		lines.push('project sections:')
		for (const row of trace.projectSections) {
			const frontmatter =
				row.frontmatter && Object.keys(row.frontmatter).length ? ` ${JSON.stringify(row.frontmatter)}` : ''
			lines.push(`  ${row.folder} ${row.path}: ${row.outcome}${frontmatter}`)
			for (const section of row.sections ?? []) {
				const how = section.contributions
					.map(({ contribution, operation }) => `${contribution} (${operation})`)
					.join(', ')
				lines.push(`    ${section.path}: ${how || 'no text'}`)
			}
		}
	}
	return `${lines.join('\n')}\n`
}

function escapeText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
	return escapeText(value).replace(/"/g, '&quot;')
}

/** A name not `found`, in text: its status and code, holding its message, and its options when ambiguous. */
export function notFoundTag(entry: ResolvedReference): string {
	const options = entry.options?.length ? `; options: ${entry.options.join(', ')}` : ''
	const name = escapeAttribute(entry.name)
	return `<reference name="${name}" status="${entry.status}" code="${entry.code}">${escapeText(`${entry.message ?? entry.status}${options}`)}</reference>`
}

/**
 * A found name's text: the main document, then each project section wrapped with its folder, in path
 * order, keeping its own heading levels (R44).
 */
export function deliveredText(entry: ResolvedReference): string {
	const content = entry.content ?? ''
	if (!entry.projectSections.length) return content
	const blocks = [
		...(content.trim() ? [content.trimEnd()] : []),
		...entry.projectSections.map(
			({ folder, content: text }) => `<project folder="${escapeAttribute(folder)}">\n${text}</project>`,
		),
	]
	return `${blocks.join('\n\n')}\n`
}

/** A found name among several, in text. */
export function referenceTag(name: string, content: string): string {
	return `<reference name="${escapeAttribute(name)}">\n${content}</reference>`
}

export const scopeOption: StringOption = {
	description: 'Tier to write: repo (default), `.agents/references/` at the root, or user, `~/.agents/references/`.',
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
