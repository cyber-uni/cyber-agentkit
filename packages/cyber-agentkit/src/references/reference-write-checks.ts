import { readFileSync } from 'node:fs'
import { implementationTemplate, readTemplate, type Template, titleOf } from './create-reference.js'
import { interfaceLookup } from './reference-check.js'
import { hasBody, isMergeOperation, type MergeOperation, parseDocument } from './reference-document.js'
import { ReferenceFailure } from './reference-error.js'
import { fitsName, type ReferenceInterface } from './reference-interface.js'
import { isDirectory, type ReferenceLayers } from './reference-layers.js'
import { parseReferenceName, type ReferenceName } from './reference-name.js'
import { gitIgnores } from './reference-projects.js'
import {
	answeringFile,
	bareName,
	checkPlaces,
	checkScope,
	inFolder,
	type TargetArgs,
	type WriteTarget,
	writeTarget,
} from './reference-write-target.js'
import { type ResolvedReference, type ResolveOptions, readExtends, resolveReference } from './resolve-reference.js'

/** The writes the validator checks. `customize` joins in U7b with its own flags. */
export type WriteCommand = 'create' | 'delete'

/** A write as its flags give it, before anything is read. */
export type WriteRequest = TargetArgs & {
	command: WriteCommand
	name: string
	merge?: string | undefined
	template?: string | undefined
	implements?: string | undefined
}

/** What the usage checks settle, before any file is read. */
export type WriteUsage = { name: ReferenceName; merge?: MergeOperation | undefined }

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

const placeFlags = '--scope, --in, --plugin, and --default'

/**
 * The usage errors, in the code table's order (C3, J10): the name (`name-missing`, `name-invalid`,
 * `reference-qualified`), then `options-conflict`, `option-invalid`, `in-not-below-root`,
 * `remove-with-template`, and `template-with-implements`. Nothing is read but the folders' paths.
 */
function checkUsage(request: WriteRequest): WriteUsage {
	const name = bareName(request.name)
	checkPlaces(request, placeFlags)
	if (request.command === 'create' && request.in !== undefined && request.merge !== undefined) {
		throw new ReferenceFailure('options-conflict', 'a project section carries no merge (K24); drop --merge or --in.')
	}
	checkScope(request.scope)
	if (request.merge !== undefined && !isMergeOperation(request.merge)) {
		throw new ReferenceFailure(
			'option-invalid',
			`--merge is replace, patch, combine, or remove; got "${request.merge}".`,
		)
	}
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
export function validateWrite(request: WriteRequest, layers: ReferenceLayers, options?: ResolveOptions): WritePlan
export function validateWrite(
	request: WriteRequest,
	layers?: ReferenceLayers,
	options: ResolveOptions = {},
): WriteUsage | WritePlan {
	const usage = checkUsage(request)
	if (!layers) return usage
	const { name, merge } = usage
	const display = options.display ?? ((path: string) => path)
	if (!isDirectory(request.root)) {
		throw new ReferenceFailure('root-missing', `the root ${request.root} does not exist or is not a folder.`, {
			details: { root: request.root },
		})
	}
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
	if (iface && target.scope !== 'project' && !fitsName(iface, name.name)) {
		const named = iface.cardinality === 'one' ? iface.id : `${iface.id}.<key>`
		throw new ReferenceFailure(
			'name-outside-interface',
			`an implementation of ${iface.id} is named ${named}, not "${name.name}".`,
			{ help: `Name it ${named}, or write it for one folder with --in.` },
		)
	}
	const template = iface ? implementationTemplate(iface) : read
	checkFolder(target, name.name)
	const before = resolveReference(name, layers, options)
	if (target.scope === 'project' && before.status === 'found' && before.format !== 'markdown') {
		throw new ReferenceFailure(
			'in-not-markdown',
			`the main document of "${name.name}" is ${before.format}, which has no project sections; customize the main document instead.`,
		)
	}
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
	const other = answeringFile(target, name.name, target.path)
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
