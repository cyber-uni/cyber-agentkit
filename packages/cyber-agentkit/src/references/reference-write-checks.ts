import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { implementationTemplate, readTemplate, type Template, titleOf } from './create-reference.js'
import { baseLayers, resolveBase } from './reference-base.js'
import { interfaceLookup } from './reference-check.js'
import { hasBody, isMergeOperation, type MergeOperation, parseDocument } from './reference-document.js'
import { ReferenceFailure } from './reference-error.js'
import { dataExtensions, formatOfFile, type ReferenceFormat } from './reference-format.js'
import { fitsName, type ReferenceInterface } from './reference-interface.js'
import { isDirectory, type ReferenceLayers } from './reference-layers.js'
import { namePattern, parseReferenceName, type ReferenceName } from './reference-name.js'
import { gitIgnores } from './reference-projects.js'
import { isGenerated } from './reference-sources.js'
import {
	answeringFile,
	bareName,
	checkPlaces,
	checkScope,
	inFolder,
	metadataFile,
	type TargetArgs,
	type WriteTarget,
	writeTarget,
} from './reference-write-target.js'
import {
	type ExtendsStep,
	type ResolvedReference,
	type ResolveOptions,
	readExtends,
	resolveReference,
} from './resolve-reference.js'

/** The writes the validator checks. */
export type WriteCommand = 'create' | 'customize' | 'delete'

/** A write as its flags give it, before anything is read. */
export type WriteRequest = TargetArgs & {
	command: WriteCommand
	name: string
	merge?: string | undefined
	template?: string | undefined
	implements?: string | undefined
	/** `customize`: the picks, bottom first, each `<plugin>`, `<plugin>:<merge>`, or `default`; `none` alone removes them. */
	extends?: readonly string[] | undefined
	/** `customize`: a YAML file holding the whole `extends` list. */
	extendsFile?: string | undefined
	/** `customize`: the file holding the customizer's request, in their own words (K22). */
	request?: string | undefined
	/** `customize`: the file holding the body to write. */
	body?: string | undefined
	/** `customize`: print the generator's input and write nothing (R84). */
	base?: boolean | undefined
	dryRun?: boolean | undefined
}

/** `customize`'s picks: the `extends` values to write, bottom first, or `none` to remove them. */
export type Picks = { values: unknown[] } | 'none'

/** What the usage checks settle, before any file is read. */
export type WriteUsage = { name: ReferenceName; merge?: MergeOperation | undefined; picks?: Picks | undefined }

/** Everything a write needs once every check passed. */
export type WritePlan = WriteUsage & {
	target: WriteTarget
	/** The name resolved before the write. */
	before: ResolvedReference
	/** `create`: what the file is made from. */
	template?: Template
	/** `create --implements`: the interface. */
	iface?: ReferenceInterface
	/** `create`: the text already at the target path, a file holding no body (a selection). */
	existing?: string
	/** `create`: the `merge` written, when one is. */
	operation?: MergeOperation | undefined
	/** `create`: the plugins the written file's `extends` names, bottom first. */
	extended: string[]
}

/** Everything `customize` needs once every check passed. */
export type CustomizePlan = WriteUsage & {
	target: WriteTarget
	/** The name resolved before the write. */
	before: ResolvedReference
	/** The name resolved as the generator reads it (R84), which the status checks read too (J4). */
	base: ResolvedReference
	/** The picks parsed, for the base: `null` for `none`, `undefined` when none are given. */
	steps?: ExtendsStep[] | null
	/** The request's text. */
	request?: string
	/** The body's text. */
	body?: string
	/** `--implements`'s interface, or the one the target file records (J4). */
	iface?: ReferenceInterface
	/** The `implements` written: `--implements`'s, or the target file's own, kept (J4). */
	implementsValue?: string
	/** The file holding the document: `<name>.md`, or a non-Markdown name's data file. */
	file: string
	format: ReferenceFormat
	/** The file holding the frontmatter: `file` for Markdown, the metadata file beside a data file (K31). */
	holder: string
	/** The text at `file`, when there is a file. */
	existing?: string
	/** The text at `holder`, when there is a file. */
	held?: string
}

const placeFlags = '--scope, --in, --plugin, and --default'

const projectMerge = 'a project section carries no merge (K24); drop --merge or --in.'

/** `--extends`'s values as written: `<plugin>`, `<plugin>/<name>`, or `default`, each optionally `:<merge>`. */
function readPicks(values: readonly string[], name: string): Picks {
	if (values.includes('none')) {
		if (values.length > 1) {
			throw new ReferenceFailure(
				'option-invalid',
				`--extends none removes the picks, so it takes no other step; got ${values.join(' ')}.`,
			)
		}
		return 'none'
	}
	if (!values.length) throw new ReferenceFailure('option-invalid', '--extends names one or more steps, or none.')
	return {
		values: values.map((value) => {
			const at = value.indexOf(':')
			const step = at === -1 ? value : value.slice(0, at)
			const merge = at === -1 ? undefined : value.slice(at + 1)
			const target = step.endsWith(`/${name}`) ? step.slice(0, -name.length - 1) : step
			if (!namePattern.test(target)) {
				throw new ReferenceFailure(
					'option-invalid',
					`--extends takes a plugin, \`<plugin>/${name}\`, or default, each optionally \`:<merge>\`; got "${value}".`,
				)
			}
			if (merge === undefined) return target
			if (!isMergeOperation(merge)) {
				throw new ReferenceFailure(
					'option-invalid',
					`the merge in "${value}" is replace, patch, combine, or remove; got "${merge}".`,
				)
			}
			return { [target]: merge }
		}),
	}
}

/**
 * `customize`'s usage errors after the name, in the code table's order (C3): `change-missing`,
 * `options-conflict`, `options-missing`, `option-invalid`, and `in-not-below-root`. `--default` is
 * read-only here, so it goes with `--scope` or `--in`; `--plugin` never does.
 */
function customizeUsage(request: WriteRequest, name: ReferenceName): Pick<WriteUsage, 'picks'> {
	const picking = request.extends !== undefined || request.extendsFile !== undefined
	const requesting = request.request !== undefined || request.body !== undefined
	if (!request.base && !picking && !requesting) {
		throw new ReferenceFailure(
			'change-missing',
			'say what to change: --extends or --extends-file picks what the name builds on, and --request with --body writes a generated body.',
			{ help: `Run \`reference customize ${name.name} --base\` for what the generator reads.` },
		)
	}
	const conflict = (message: string) => new ReferenceFailure('options-conflict', message)
	if (request.plugin !== undefined) {
		throw conflict('customize never writes a file a plugin ships; an author writes one with `create --plugin`.')
	}
	if (request.scope !== undefined && request.in !== undefined) {
		throw conflict('pass --scope or --in, not both: a customization goes to one place.')
	}
	if (request.in !== undefined && request.merge !== undefined) throw conflict(projectMerge)
	if (request.in !== undefined && picking) {
		throw conflict('a project section has no stack, so it takes no picks; pick for the main document with --scope.')
	}
	if (request.extends !== undefined && request.extendsFile !== undefined) {
		throw conflict('pass --extends or --extends-file, not both.')
	}
	if (request.implements !== undefined && picking) {
		throw conflict('an implementation is a whole document that replaces the stack, so it takes no picks.')
	}
	if (request.base && (requesting || request.merge !== undefined || request.dryRun)) {
		throw conflict(
			'--base writes nothing; it takes only --extends or --extends-file, --scope or --in, --default, and --implements.',
		)
	}
	if (requesting && request.extends?.includes('none')) {
		throw conflict('--extends none removes the picks and writes no body; pass it without --request and --body.')
	}
	if (requesting && (request.request === undefined || request.body === undefined)) {
		throw new ReferenceFailure(
			'options-missing',
			request.request === undefined
				? '--body needs --request: a generated body records the request it was written from.'
				: '--request needs --body: the command writes the body the generator wrote, and runs no model.',
		)
	}
	checkScope(request.scope)
	checkMerge(request.merge)
	const picks = request.extends === undefined ? undefined : readPicks(request.extends, name.name)
	if (request.in !== undefined) inFolder(request.in, request.root)
	return picks ? { picks } : {}
}

function checkMerge(merge: string | undefined): void {
	if (merge !== undefined && !isMergeOperation(merge)) {
		throw new ReferenceFailure('option-invalid', `--merge is replace, patch, combine, or remove; got "${merge}".`)
	}
}

/**
 * The usage errors, in the code table's order (C3, J10): the name (`name-missing`, `name-invalid`,
 * `reference-qualified`), then `options-conflict`, `option-invalid`, `in-not-below-root`,
 * `remove-with-template`, and `template-with-implements`. Nothing is read but the folders' paths.
 */
function checkUsage(request: WriteRequest): WriteUsage {
	const name = bareName(request.name)
	if (request.command === 'customize') {
		return { name, merge: request.merge as MergeOperation | undefined, ...customizeUsage(request, name) }
	}
	checkPlaces(request, placeFlags)
	if (request.command === 'create' && request.in !== undefined && request.merge !== undefined) {
		throw new ReferenceFailure('options-conflict', projectMerge)
	}
	checkScope(request.scope)
	checkMerge(request.merge)
	const merge = request.merge as MergeOperation | undefined
	if (request.in !== undefined) inFolder(request.in, request.root)
	if (request.command === 'create') {
		if (merge === 'remove' && request.template !== undefined) {
			throw new ReferenceFailure('remove-with-template', '--merge remove writes no body, so it takes no --template.')
		}
		if (request.template !== undefined && request.implements !== undefined) {
			throw new ReferenceFailure('template-with-implements', 'pass --template or --implements, not both.')
		}
	}
	return { name, merge }
}

function lookUpInterface(id: string, layers: ReferenceLayers, options: ResolveOptions): ReferenceInterface {
	const parsed = parseReferenceName(id)
	if (parsed.invalid || parsed.plugin !== undefined) {
		throw new ReferenceFailure('interface-invalid', `"${id}" is not an interface id.`)
	}
	const iface = interfaceLookup(layers, options)(id)
	if (!iface.value) throw new ReferenceFailure('interface-invalid', iface.failure?.message ?? `no interface ${id}`)
	return iface.value
}

function tryRead(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}

/** The `merge` a `create` writes (R27): none in a project section; on a plugin or default, only `--merge`. */
function operationOf(
	request: WriteRequest,
	target: WriteTarget,
	merge: MergeOperation | undefined,
	template: Template,
) {
	if (target.scope === 'project') return undefined
	if (request.implements !== undefined) return 'replace'
	if (target.scope === 'plugin' || target.scope === 'default') return merge
	const own = template.metadata['merge']
	return merge ?? (isMergeOperation(own) ? own : undefined) ?? 'patch'
}

/**
 * Checks a write in one fixed order, so the same code wins whatever else is wrong (C3, J10). With no
 * `layers`, only the usage errors are checked, which a command does before it reads the layers, so
 * a usage error comes before `root-missing`. With them, every check runs: the usage errors again,
 * then `root-missing`, `folder-invalid`, `template-*`, `interface-invalid`, `name-outside-interface`,
 * `in-*`, `extends-replace`, and `file-exists`.
 */
export function validateWrite(request: WriteRequest): WriteUsage
export function validateWrite(
	request: WriteRequest & { command: 'customize' },
	layers: ReferenceLayers,
	options?: ResolveOptions,
): CustomizePlan
export function validateWrite(
	request: WriteRequest & { command: 'create' | 'delete' },
	layers: ReferenceLayers,
	options?: ResolveOptions,
): WritePlan
export function validateWrite(
	request: WriteRequest,
	layers?: ReferenceLayers,
	options: ResolveOptions = {},
): WriteUsage | WritePlan | CustomizePlan {
	const usage = checkUsage(request)
	if (!layers) return usage
	const { name, merge } = usage
	const display = options.display ?? ((path: string) => path)
	if (!isDirectory(request.root)) {
		throw new ReferenceFailure('root-missing', `the root ${request.root} does not exist or is not a folder.`, {
			details: { root: request.root },
		})
	}
	if (request.command === 'customize') return planCustomize(request, usage, layers, options)
	const target = writeTarget(name, request)
	if (request.command === 'delete') {
		checkFolder(target, name.name)
		return { name, merge, target, before: resolveReference(name, layers, options), extended: [] }
	}

	const read: Template =
		request.implements !== undefined || merge === 'remove'
			? { content: '', metadata: {}, body: '' }
			: readTemplate(request.template)
	const title = titleOf(read)
	if (title) {
		throw new ReferenceFailure(
			'template-title',
			`the template's top level is the single heading "${title}" holding the others; patch matches by heading path, so make its sections top-level.`,
		)
	}
	const iface = request.implements === undefined ? undefined : lookUpInterface(request.implements, layers, options)
	checkNamespace(iface, target, name)
	const template = iface ? implementationTemplate(iface) : read
	checkFolder(target, name.name)
	const before = resolveReference(name, layers, options)
	checkMarkdown(before, target, name)
	const plan: WritePlan = { name, merge, target, template, before, extended: [] }
	if (iface) plan.iface = iface

	const existing = tryRead(target.path)
	const held = existing === undefined ? undefined : parseDocument(existing, () => {})
	plan.operation = operationOf(request, target, merge, template)
	const steps = readExtends(held?.metadata['extends'], () => {}) ?? readExtends(template.metadata['extends'], () => {})
	plan.extended = (steps ?? []).map(({ target: step }) => step).filter((step) => step !== 'default')
	if (
		(target.scope === 'plugin' || target.scope === 'default') &&
		plan.operation === 'replace' &&
		plan.extended.length
	) {
		throw new ReferenceFailure(
			'extends-replace',
			`a ${target.scope === 'plugin' ? "plugin's file" : "skill's default"} that extends ${plan.extended.join(', ')} states only the sections it changes, so it takes no merge: replace; to replace the base entirely, write a snapshot of your own with no extends on it.`,
		)
	}

	if (held && hasBody(held.body)) {
		throw new ReferenceFailure(
			'file-exists',
			`${display(target.path)} already holds "${name.name}"; change it with the reference skill's Update mode.`,
			{ details: { path: display(target.path) } },
		)
	}
	const other = answeringFile(target, name.name, target.path) ?? selectingSidecar(target, name.name)
	if (other) {
		throw new ReferenceFailure(
			'file-exists',
			`${display(other)} already answers "${name.name}" in that folder; change it there, or delete it first.`,
			{ details: { path: display(other) } },
		)
	}
	if (existing !== undefined) plan.existing = existing
	return plan
}

/**
 * A metadata file with `extends` at the target is a selection for a non-Markdown name (R93): it
 * answers the name in another form, so `create` does not write a Markdown file beside it.
 */
function selectingSidecar(target: WriteTarget, name: string): string | undefined {
	if (target.scope === 'project') return undefined
	const path = metadataFile(target, name)
	const held = tryParse(tryRead(path))
	return held && held.metadata['extends'] !== undefined ? path : undefined
}

/** `--in`'s folder must exist and be one git does not ignore (J8), since nothing would read the file. */
function checkFolder(target: WriteTarget, name: string): void {
	if (target.scope !== 'project' || target.folderPath === undefined || target.folder === undefined) return
	if (!isDirectory(target.folderPath)) {
		throw new ReferenceFailure('in-folder-missing', `--in names ${target.folderPath}, which does not exist.`, {
			details: { folder: target.folder },
		})
	}
	if (gitIgnores(target.folderPath, target.path)) {
		throw new ReferenceFailure(
			'in-folder-ignored',
			`git ignores ${target.folder}/.agents/references/${name}.md, so load would never read a project section there.`,
			{ details: { folder: target.folder } },
		)
	}
}

/** An implementation is named in its interface's namespace (J9), except a folder's project section. */
function checkNamespace(iface: ReferenceInterface | undefined, target: WriteTarget, name: ReferenceName): void {
	if (!iface || target.scope === 'project' || fitsName(iface, name.name)) return
	const named = iface.cardinality === 'one' ? iface.id : `${iface.id}.<key>`
	throw new ReferenceFailure(
		'name-outside-interface',
		`an implementation of ${iface.id} is named ${named}, not "${name.name}".`,
		{ help: `Name it ${named}, or write it for one folder with --in.` },
	)
}

/** A name whose main document is not Markdown has no project sections (UC18.5). */
function checkMarkdown(before: ResolvedReference, target: WriteTarget, name: ReferenceName): void {
	if (target.scope !== 'project' || before.status !== 'found' || before.format === 'markdown') return
	throw new ReferenceFailure(
		'in-not-markdown',
		`the main document of "${name.name}" is ${before.format}, which has no project sections; customize the main document instead.`,
	)
}

/** A `--request` or `--body` file's text (R81). */
function readGiven(path: string, flag: string): string {
	try {
		return readFileSync(path, 'utf8')
	} catch (error) {
		throw new ReferenceFailure('file-unreadable', `cannot read the ${flag} file ${path}: ${(error as Error).message}`, {
			details: { path },
		})
	}
}

function isStep(value: unknown): boolean {
	if (typeof value === 'string') return namePattern.test(value)
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
	const entries = Object.entries(value)
	if (entries.length !== 1) return false
	const [target, keys] = entries[0] as [string, unknown]
	if (!namePattern.test(target)) return false
	if (keys === null || keys === undefined) return true
	if (typeof keys === 'string') return isMergeOperation(keys)
	if (typeof keys !== 'object' || Array.isArray(keys)) return false
	const record = keys as Record<string, unknown>
	if (Object.keys(record).some((key) => key !== 'merge' && key !== 'extends' && key !== 'sections')) return false
	if (record['merge'] !== undefined && !isMergeOperation(record['merge'])) return false
	if (record['sections'] !== undefined && !Array.isArray(record['sections'])) return false
	return record['extends'] === undefined || (Array.isArray(record['extends']) && record['extends'].every(isStep))
}

/** An `--extends-file`: a YAML `extends` list, or a mapping holding one, every step key kept (R79). */
function readExtendsFile(path: string): Picks {
	const invalid = (why: string) =>
		new ReferenceFailure('extends-file-invalid', `the --extends-file ${path} ${why}.`, { details: { path } })
	let text: string
	try {
		text = readFileSync(path, 'utf8')
	} catch (error) {
		throw invalid(`cannot be read: ${(error as Error).message}`)
	}
	let parsed: unknown
	try {
		parsed = parseYaml(text)
	} catch (error) {
		throw invalid(`is not YAML: ${(error as Error).message}`)
	}
	const list =
		parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)['extends']
			: parsed
	if (!Array.isArray(list) || !list.length || !list.every(isStep)) {
		throw invalid('is not a YAML `extends` list: each step a plugin or default, with only merge, extends, and sections')
	}
	return { values: list }
}

/** The picks as the resolver reads them; `sections` is left to the resolver that reads it. */
function stepsOf(picks: Picks | undefined): ExtendsStep[] | null | undefined {
	if (picks === undefined) return undefined
	if (picks === 'none') return null
	const strip = (value: unknown): unknown => {
		if (typeof value !== 'object' || value === null) return value
		const [target, keys] = Object.entries(value)[0] as [string, unknown]
		if (typeof keys !== 'object' || keys === null) return value
		const { sections: _sections, extends: nested, ...rest } = keys as Record<string, unknown>
		return { [target]: Array.isArray(nested) ? { ...rest, extends: nested.map(strip) } : rest }
	}
	return readExtends(picks.values.map(strip), () => {}) ?? []
}

/** Each top step must be `default` or a plugin holding the name in the layers the target reads (R79). */
function checkSteps(steps: readonly ExtendsStep[], name: string, before: ResolvedReference, layers: ReferenceLayers) {
	const readable = new Set(
		layers.layers.flatMap(({ tier, plugin, skipped }) => (tier === 'plugin' && plugin && !skipped ? [plugin] : [])),
	)
	const holders = new Set(
		before.trace.layers.flatMap(({ tier, plugin, file }) =>
			tier === 'plugin' && plugin !== undefined && file && readable.has(plugin) ? [plugin] : [],
		),
	)
	const wrong = steps.map(({ target }) => target).filter((target) => target !== 'default' && !holders.has(target))
	if (!wrong.length) return
	throw new ReferenceFailure(
		'step-invalid',
		`${wrong.join(', ')} ${wrong.length === 1 ? 'is' : 'are'} neither default nor a plugin holding "${name}"${holders.size ? `; the plugins holding it are ${[...holders].join(', ')}` : ''}.`,
		{ details: { steps: wrong } },
	)
}

/** The interface whose namespace holds a name: `<id>` for cardinality one, `<id>.<key>` for many (R111). */
function coveringInterface(
	name: string,
	layers: ReferenceLayers,
	options: ResolveOptions,
): ReferenceInterface | undefined {
	const lookup = interfaceLookup(layers, options)
	const parts = name.split('.')
	for (let at = parts.length; at >= 1; at--) {
		const found = lookup(parts.slice(0, at).join('.')).value
		if (found && fitsName(found, name)) return found
	}
	return undefined
}

function tryParse(text: string | undefined): ReturnType<typeof parseDocument> | undefined {
	return text === undefined ? undefined : parseDocument(text, () => {})
}

/**
 * Where a customization lands: the Markdown file, or for a non-Markdown name its data file with the
 * record in the metadata file beside it (R92). A target answering in `<name>/README.md` is the
 * customizer's to change by hand (J7); a project section is always Markdown.
 */
function customizeFiles(target: WriteTarget, name: string, before: ResolvedReference) {
	const forms =
		target.scope === 'project'
			? [target.path, join(target.dir, name, 'README.md')]
			: [
					target.path,
					join(target.dir, name, 'README.md'),
					...dataExtensions.map(({ extension }) => join(target.dir, `${name}${extension}`)),
				]
	const answering = answeringFile(target, name)
	const held = answering !== undefined && forms.includes(answering) ? answering : undefined
	const readme = join(target.dir, name, 'README.md')
	let file = target.path
	let format: ReferenceFormat = 'markdown'
	if (held !== undefined && held !== readme) {
		file = held
		format = formatOfFile(held)
	} else if (
		held === undefined &&
		target.scope !== 'project' &&
		before.status === 'found' &&
		before.format !== undefined &&
		before.format !== 'markdown'
	) {
		format = before.format
		const top = [...before.trace.contributions].reverse().find(({ path }) => formatOfFile(path) === format)
		const extension = top ? extname(top.path) : dataExtensions.find((item) => item.format === format)?.extension
		file = join(target.dir, `${name}${extension}`)
	}
	return {
		file,
		format,
		holder: format === 'markdown' ? file : metadataFile(target, name),
		other: held === readme ? readme : undefined,
	}
}

function quietInterface(value: unknown, layers: ReferenceLayers, options: ResolveOptions) {
	const entry = Array.isArray(value) ? value[0] : value
	const id = typeof entry === 'string' ? /^(.+)@\d+$/.exec(entry.trim())?.[1] : undefined
	return id === undefined ? undefined : interfaceLookup(layers, options)(id).value
}

/**
 * `customize`'s checks once the root is there, in C3 order: `file-unreadable` and
 * `extends-file-invalid`, `interface-invalid`, `name-outside-interface`, the `in-*` checks,
 * `step-invalid`, `pick-required` and `implements-required`, `body-not-generated`, and `file-exists`.
 * `--base` runs them as a request would (J5), except the last two, which guard the file a write
 * replaces. The status checks read the name as the generator does
 * (J4): the target file adds only its `extends`, and its `implements` is kept.
 */
function planCustomize(
	request: WriteRequest,
	usage: WriteUsage,
	layers: ReferenceLayers,
	options: ResolveOptions,
): CustomizePlan {
	const { name } = usage
	const display = options.display ?? ((path: string) => path)
	const target = writeTarget(name, { root: request.root, home: request.home, scope: request.scope, in: request.in })
	const requestText = request.request === undefined ? undefined : readGiven(request.request, '--request')
	const bodyText = request.body === undefined ? undefined : readGiven(request.body, '--body')
	const picks = request.extendsFile === undefined ? usage.picks : readExtendsFile(request.extendsFile)
	const named = request.implements === undefined ? undefined : lookUpInterface(request.implements, layers, options)
	checkNamespace(named, target, name)
	checkFolder(target, name.name)
	const before = resolveReference(name, layers, options)
	checkMarkdown(before, target, name)
	const steps = stepsOf(picks)
	if (steps) checkSteps(steps, name.name, before, baseLayers(layers, target))

	const files = customizeFiles(target, name.name, before)
	const existing = tryRead(files.file)
	const held = files.holder === files.file ? existing : tryRead(files.holder)
	const heldDocument = tryParse(held)
	const recorded = named || target.scope === 'project' ? undefined : heldDocument?.metadata['implements']
	const iface = named ?? (recorded === undefined ? undefined : quietInterface(recorded, layers, options))
	const base = resolveBase(name, layers, target, steps, options)
	const requesting = requestText !== undefined || Boolean(request.base)
	if (requesting && picks === undefined && base.status === 'ambiguous') {
		throw new ReferenceFailure(
			'pick-required',
			`"${name.name}" is ambiguous: ${base.message}; pick what it builds on before the request is applied.`,
			{
				details: { options: base.options ?? [] },
				help: `Pass --extends with the picks, bottom first, from: ${(base.options ?? []).join(', ')}.`,
			},
		)
	}
	if (requesting && !iface && recorded === undefined && base.status === 'missing') {
		const covering = coveringInterface(name.name, layers, options)
		if (covering) {
			throw new ReferenceFailure(
				'implements-required',
				`"${name.name}" is in the namespace of the interface ${covering.id}, and nothing implements it; name the interface.`,
				{
					details: { interface: covering.id },
					help: `Run \`reference customize ${name.name} --implements ${covering.id} --request <file> --body <file>\`.`,
				},
			)
		}
	}
	const bodyHeld = files.format === 'markdown' ? hasBody(heldDocument?.body ?? '') : Boolean(existing?.trim())
	// `--base` replaces no file, so the checks on the file a write would replace do not apply to it.
	if (requestText !== undefined && bodyHeld && !isGenerated(heldDocument?.metadata)) {
		throw new ReferenceFailure(
			'body-not-generated',
			`${display(files.file)} holds a body that records no request, written with create or by hand; customizing would replace it.`,
			{
				details: { path: display(files.file) },
				help: "Change it with the reference skill's Update mode, or delete it first.",
			},
		)
	}
	if (files.other && !request.base) {
		throw new ReferenceFailure(
			'file-exists',
			`${display(files.other)} already answers "${name.name}" in that folder; change it there, or delete it first.`,
			{ details: { path: display(files.other) } },
		)
	}
	const plan: CustomizePlan = {
		...usage,
		picks,
		target,
		before,
		base,
		file: files.file,
		format: files.format,
		holder: files.holder,
	}
	if (steps !== undefined) plan.steps = steps
	if (requestText !== undefined) plan.request = requestText
	if (bodyText !== undefined) plan.body = bodyText
	if (iface) plan.iface = iface
	if (named) plan.implementsValue = `${named.id}@${named.version}`
	else if (typeof recorded === 'string') plan.implementsValue = recorded
	if (existing !== undefined) plan.existing = existing
	if (held !== undefined) plan.held = held
	return plan
}
