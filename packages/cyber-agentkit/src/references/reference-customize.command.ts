import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { document, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import type { ReferenceWarning } from './reference-codes.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	defaultReferencePath,
	deliveredText,
	displayTrace,
	givenRoot,
	inOption,
	type LayersFor,
	notFoundTag,
	rootOption,
	scopeOption,
	traceOption,
	traceText,
	writeWarnings,
} from './reference-command-support.js'
import { type CustomizeResult, customizeContribution, type FamilyCustomizeResult } from './reference-customize.js'
import { ReferenceFailure } from './reference-error.js'
import { isFamilyName, parseFamily } from './reference-name.js'
import { describeAnswer } from './reference-write.js'
import { validateWrite } from './reference-write-checks.js'
import type { ReferenceTrace, ResolvedProjectSection } from './resolve-reference.js'

/** `customize --base`: what the generator reads for the target (R84). */
export type ReferenceCustomizeBase = {
	status: string
	stack?: string[]
	/** The interface's stub when one is named, then the main document built for the target. */
	content: string
	/** For a folder target: the project sections of the folders above it. */
	projectSections?: Pick<ResolvedProjectSection, 'folder' | 'content'>[]
}

/** A write's report is informational (R38), except its `code` and `warnings`, which are contract (J25). */
export type ReferenceCustomizeReport = {
	path: string
	/** A project section's folder, relative to the root. */
	folder?: string
	/** A non-Markdown name's metadata file, which holds the record. */
	metadataFile?: string
	/** `no-selection` when `--extends none` found none: a no-op, exit 0. */
	code?: 'no-selection'
	message?: string
	extends?: unknown[]
	deleted?: boolean
	status?: string
	stack?: string[]
	answer?: string
	hint?: string
	content?: string
	metadataContent?: string
	hints?: string[]
	warnings?: ReferenceWarning[]
	trace?: ReferenceTrace
}

/** `customize <prefix>.*`: one entry per interface of the family, in name order (UC24). `written` carries what a single name's report does. */
export type ReferenceFamilyCustomizeReport = {
	family: string
	interfaces: (Partial<ReferenceCustomizeReport> & {
		interface: string
		outcome: 'written' | 'kept' | 'skipped'
		reason?: string
	})[]
	hint?: string
}

type CustomizeCommandArgs = CommonArgs & {
	name: string
	steps: string[] | undefined
	scope: string | undefined
	in: string | undefined
	plugin: string | undefined
	default: string | undefined
	extends: string[] | undefined
	'extends-file': string | undefined
	request: string | undefined
	body: string | undefined
	merge: string | undefined
	implements: string | undefined
	base: boolean | undefined
	'dry-run': boolean | undefined
	trace: boolean | undefined
}

function baseReport(customized: CustomizeResult): ReferenceCustomizeBase {
	const base = customized.base
	const resolved = base?.resolved
	return compact({
		status: resolved?.status ?? 'missing',
		stack: resolved?.trace.stack,
		content: base?.content ?? '',
		projectSections: base?.projectSections.map(({ folder, content }) => ({ folder, content })),
	})
}

function baseText(customized: CustomizeResult): string {
	const base = customized.base
	if (!base) return ''
	if (!base.content && !base.projectSections.length && base.resolved.status !== 'found') {
		return `${notFoundTag(base.resolved)}\n`
	}
	return deliveredText({ ...base.resolved, content: base.content, projectSections: base.projectSections })
}

function report(customized: CustomizeResult, args: CustomizeCommandArgs, home: string): ReferenceCustomizeReport {
	const display = (path: string) => collapseHome(home, path)
	const after = customized.after
	return compact({
		path: display(customized.path),
		folder: customized.folder,
		metadataFile: customized.metadataFile === undefined ? undefined : display(customized.metadataFile),
		code: customized.code,
		message: customized.message,
		extends: customized.extends,
		deleted: customized.deleted,
		status: after?.status,
		stack: after?.trace.stack,
		answer: after ? describeAnswer(after, display) : undefined,
		hint: customized.dryRun
			? 'Nothing was written. Run again without --dry-run to write it.'
			: customized.code
				? undefined
				: `Run \`load ${customized.name}\` for the composed document.`,
		content: customized.dryRun ? customized.content : undefined,
		metadataContent: customized.dryRun ? customized.metadataContent : undefined,
		hints: customized.hints,
		warnings: customized.warnings,
		trace: args.trace && after && !customized.code ? displayTrace(after.trace, home) : undefined,
	})
}

function text(customized: CustomizeResult, shown: ReferenceCustomizeReport): string {
	if (customized.code) return `${shown.path}\n\n${customized.code}: ${customized.message}\n`
	if (customized.dryRun) {
		const head = customized.deleted ? 'would delete the file, left with nothing in it.\n' : (customized.content ?? '')
		const meta =
			customized.metadataContent === undefined ? '' : `\n${shown.metadataFile}\n\n${customized.metadataContent}`
		return `${shown.path}\n\n${head}${meta}`
	}
	if (customized.action === 'cleared') {
		const what = customized.deleted ? 'selection removed; the file was left empty and deleted' : 'selection removed'
		return `${shown.path}\n\n${what}. ${shown.answer}\n`
	}
	if (customized.action === 'selection') {
		return `${shown.path}\n\nextends: ${JSON.stringify(customized.extends)}. ${shown.answer}\n`
	}
	const meta = shown.metadataFile ? ` Its record is in ${shown.metadataFile}.` : ''
	return `${shown.path}\n\n${shown.hint}${meta}\n`
}

function familyReport(
	customized: FamilyCustomizeResult,
	args: CustomizeCommandArgs,
	home: string,
): ReferenceFamilyCustomizeReport {
	return compact({
		family: customized.family,
		interfaces: customized.interfaces.map(({ interface: id, outcome, reason, result: each }) =>
			compact({ interface: id, outcome, reason, ...(each ? report(each, args, home) : {}) }),
		),
		hint: customized.dryRun
			? 'Nothing was written. Run again without --dry-run to write it.'
			: 'Run `load <interface>` for each composed document.',
	})
}

function familyText(customized: FamilyCustomizeResult, shown: ReferenceFamilyCustomizeReport): string {
	return `${customized.interfaces
		.map(({ interface: id, outcome, reason, result: each }, at) => {
			if (!each) return `${id}: ${outcome}. ${reason}\n`
			const own = shown.interfaces[at] as ReferenceCustomizeReport
			return `${id}: ${outcome}.\n${text(each, own)}`
		})
		.join('\n')}`
}

export function customizeCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'customize',
		description:
			"Customize a name for the repo or user tier, or a folder's project section, running no model: pick what it builds on (`extends`), write a body generated from a request with its record, or print what the generator reads (--base). Writes a file a contribution above hides, with a warning.",
		arguments: [
			{
				name: 'name',
				description:
					'Reference name, without the `.md` extension; or a family, `<prefix>.*`, to pick for every interface under the prefix at once (takes --extends or --extends-file, no `sections`).',
				type: t.string(),
			},
			{
				name: 'steps',
				description: 'More steps for --extends, so `--extends a b` lists both, bottom first.',
				type: t.array(t.string()).optional(),
			},
		],
		options: {
			root: rootOption,
			scope: scopeOption,
			in: { ...inOption, description: `${inOption.description} Takes no --extends or --merge.` },
			default: {
				description:
					"The calling skill's folder, read only: its `references/<name>.default.md` joins the stack as the `default` tier.",
				type: t.string().optional(),
			},
			plugin: {
				description: "Not accepted: customize never writes a plugin's file; an author uses `create --plugin`.",
				type: t.string().optional(),
			},
			extends: {
				description:
					'The picks, bottom first: each a plugin holding the name, `<plugin>:<merge>` (such as `house-style:combine`), or `default`; `none` removes them. A file with no body is a selection.',
				type: t.array(t.string()).optional(),
			},
			'extends-file': {
				description:
					'A YAML file holding the whole `extends` list, with every step key (`merge`, `extends`, `sections`).',
				type: t.string().optional(),
			},
			request: {
				description:
					"A file holding the customizer's request, in their own words; recorded as `request`. Needs --body.",
				type: t.string().optional(),
			},
			body: {
				description:
					'A file holding the body the generator wrote; written as given, with the picks, sources, and request recorded. Needs --request.',
				type: t.string().optional(),
			},
			merge: {
				description:
					'How the body applies over what is below: patch (default), combine, or replace for a whole document.',
				type: t.string().optional(),
			},
			implements: {
				description:
					"Interface id the body implements: a whole document recording `implements` and `merge: replace`; with --in, a project section from the interface's stub.",
				type: t.string().optional(),
			},
			base: {
				description:
					"Print what the generator reads for the target, and write nothing: the name resolved with the picks, leaving out the target file, managed text, the tier above, and personal text; with --implements, the interface's stub first.",
				type: t.boolean().optional(),
			},
			'dry-run': {
				description: 'Print the target path and the exact content, and write nothing.',
				type: t.boolean().optional(),
			},
			trace: { ...traceOption, description: 'After the write, add the trace, in which the written file applies.' },
		},
		examples: [
			{ command: `${path} customize my-topic`, description: 'Customize a reference for this project' },
			{
				command: `${path} customize my-skill.aspects.* --extends house-style`,
				description: 'Pick one plugin for every interface under a prefix',
			},
		],
		async run(args: CustomizeCommandArgs) {
			const format = this.format
			try {
				const home = homedir()
				const display = (path: string) => collapseHome(home, path)
				const picks = args.extends === undefined ? undefined : [...args.extends, ...(args.steps ?? [])]
				const request = {
					root: givenRoot(args.root),
					home,
					name: args.name,
					scope: args.scope,
					in: args.in,
					plugin: args.plugin,
					default: args.default,
					extends: picks,
					extendsFile: args['extends-file'],
					request: args.request,
					body: args.body,
					merge: args.merge,
					implements: args.implements,
					base: args.base,
					dryRun: args['dry-run'],
				}
				const family = isFamilyName(args.name) || args.name.includes('*') ? parseFamily(args.name) : undefined
				// A usage error comes before anything is read, `root-missing` included (C3).
				validateWrite({
					command: 'customize',
					...request,
					name: family === undefined || family.invalid !== undefined ? args.name : family.prefix,
				})
				if (args.steps?.length && args.extends === undefined) {
					throw new ReferenceFailure(
						'options-missing',
						`${args.steps.join(' ')} follow no --extends; pass --extends before the steps.`,
					)
				}
				const layers = await layersFor({ root: args.root, default: args.default }, home)
				if (family !== undefined) {
					const customized = customizeContribution(
						layers,
						{ ...request, name: args.name as `${string}.*`, root: layers.root ?? request.root },
						{ display },
					)
					const shown = familyReport(customized, args, home)
					if (format !== 'text') return result(shown)
					for (const { result: each } of customized.interfaces) writeWarnings(each?.warnings ?? [])
					return document(familyText(customized, shown))
				}
				const customized = customizeContribution(layers, { ...request, root: layers.root ?? request.root }, { display })
				if (customized.action === 'base') {
					if (format !== 'text') return result(baseReport(customized))
					return document(baseText(customized))
				}
				const shown = report(customized, args, home)
				if (format !== 'text') return result(shown)
				writeWarnings(customized.warnings)
				for (const hint of customized.hints) process.stderr.write(`hint: ${hint}\n`)
				if (args.trace && customized.after && !customized.code) process.stderr.write(traceText(customized.after, home))
				return document(text(customized, shown))
			} catch (error) {
				return asCliError(error, 'Reference customization failed.')
			}
		},
	})
}
