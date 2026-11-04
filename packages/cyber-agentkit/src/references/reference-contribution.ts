import { type Dirent, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { WarnFn } from './reference-codes.js'
import { hasBody, type MergeOperation, parseDocument, readMergeOperation } from './reference-document.js'
import { dataExtensions, formatOfFile, type ReferenceFormat } from './reference-format.js'
import type { ReferenceLayer } from './reference-layers.js'
import { defaultLayoutFinding, legacyRewrite, warnLegacy } from './reference-legacy.js'
import { defaultSuffix, parseReferenceName } from './reference-name.js'
import { readSidecar, type Sidecar } from './reference-sidecar.js'
import { type ExtendsStep, readExtends } from './reference-stack.js'
import type { ReferenceTraceLayer } from './resolve-reference.js'

export type Contribution = {
	layer: ReferenceLayer
	entry: ReferenceTraceLayer
	label: string
	path: string
	metadata: Record<string, unknown>
	body: string
	hasBody: boolean
	format: ReferenceFormat
	/** Read as written: a data file. It never merges or extends. */
	whole: boolean
	merge: MergeOperation | undefined
	/** Its own `extends`, when written and well formed. */
	steps: ExtendsStep[] | undefined
}

export function tryRead(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}

/** The files that answer a name in a layer, in the order they answer. */
export function candidateFiles(layer: Pick<ReferenceLayer, 'tier'>, name: string): string[] {
	return layer.tier === 'default'
		? [`${name}${defaultSuffix}.md`, ...dataExtensions.map(({ extension }) => `${name}${defaultSuffix}${extension}`)]
		: [`${name}.md`, `${name}/README.md`, ...dataExtensions.map(({ extension }) => `${name}${extension}`)]
}

export function contributionLabel(layer: ReferenceLayer, path: string, display: (path: string) => string): string {
	if (layer.tier === 'plugin') return `plugin ${layer.plugin}`
	if (layer.tier === 'default') return `default of ${layer.skill}`
	return `${layer.tier} ${display(path)}`
}

type ReadContext = {
	display: (path: string) => string
	without: string | undefined
	warnAt: (where: string) => WarnFn
	/** The older names a file filed under applies as this one in a tier folder (R97); an owner's own folder never reads them. */
	older?: readonly string[] | undefined
}

export function readContribution(
	layer: ReferenceLayer,
	name: string,
	entry: ReferenceTraceLayer,
	{ display, without, warnAt, older = [] }: ReadContext,
): Contribution | undefined {
	if (layer.tier !== 'default') {
		const stray = join(layer.dir, `${name}${defaultSuffix}.md`)
		if (stray !== without && tryRead(stray) !== undefined) {
			warnAt(display(stray))('default-in-tier', "it is ignored: a default goes in a skill's references/ folder")
		}
	}
	// The name's own files answer first, then each older name's, in K30 order within each (R67, R97).
	const owner = layer.tier === 'plugin' || layer.tier === 'default'
	const filed = [name, ...(owner ? [] : older)]
	const hits = filed.flatMap((as) =>
		candidateFiles(layer, as).flatMap((file) => {
			const path = join(layer.dir, file)
			const raw = path === without ? undefined : tryRead(path)
			return raw === undefined ? [] : [{ file, path, raw, as }]
		}),
	)
	const [hit, ...ignored] = hits
	for (const other of ignored) {
		warnAt(display(other.path))('file-ignored', `it is ignored: ${hit?.file} answers first in that folder`)
	}
	const format = hit ? formatOfFile(hit.file) : undefined
	const sidecarContext = { without, display, warnAt, read: tryRead }
	let sidecar = readSidecar(layer, hit?.as ?? name, format, sidecarContext)
	if (!hit && !sidecar && !owner) {
		for (const as of older) {
			sidecar = readSidecar(layer, as, undefined, sidecarContext)
			if (!sidecar) continue
			renamed(entry, as, name, sidecar.path, display, warnAt)
			break
		}
	}
	if (hit && hit.as !== name) renamed(entry, hit.as, name, hit.path, display, warnAt)
	if (!hit && !sidecar && layer.tier === 'default') warnDefaultLayout(layer, name, { display, without, warnAt })
	if (!hit) return sidecar ? sidecarSelection(layer, entry, sidecar, display, warnAt) : undefined
	const label = contributionLabel(layer, hit.path, display)
	const warn = warnAt(label)
	if (format !== 'markdown') {
		Object.assign(entry, { path: hit.path, file: hit.file, outcome: '' })
		const held = hit.raw.trim().length > 0
		if (!held) entry.empty = true
		const metadata = sidecar?.metadata ?? {}
		if (sidecar) entry.frontmatter = sidecar.frontmatter
		if (typeof metadata['description'] === 'string') entry.description = metadata['description']
		return {
			layer,
			entry,
			label,
			path: hit.path,
			metadata,
			body: hit.raw,
			hasBody: held,
			whole: true,
			format: format as ReferenceFormat,
			merge: 'replace',
			steps: sidecar ? readExtends(sidecar.metadata['extends'], warnAt(display(sidecar.path))) : undefined,
		}
	}
	const { metadata, body } = parseDocument(hit.raw, warn)
	const fix = legacyFix(layer, name, display)
	for (const finding of legacyRewrite(metadata, body, 'contribution', name).findings) warnLegacy(finding, fix, warn)
	const merge = readMergeOperation(metadata, warn)
	const steps = readExtends(metadata['extends'], warn)
	Object.assign(entry, { path: hit.path, file: hit.file, frontmatter: metadata, outcome: '' })
	if (typeof metadata['description'] === 'string') entry.description = metadata['description']
	const bodyHeld = hasBody(body)
	if (!bodyHeld) entry.empty = true
	if (steps && !bodyHeld && merge !== 'remove') entry.selection = true
	return { layer, entry, label, path: hit.path, metadata, body, hasBody: bodyHeld, format, whole: false, merge, steps }
}

/** Who rewrites a legacy form, and how (R119): only a file `migrate` may change gets the command itself. */
function legacyFix(layer: ReferenceLayer, name: string, display: (path: string) => string): string {
	if (layer.tier === 'plugin') {
		return `Plugin ${layer.plugin}'s author rewrites it with \`reference migrate --plugin <its source folder>\`; until then, customize the name.`
	}
	if (layer.tier === 'default') {
		return `Its skill's author rewrites it with \`reference migrate ${name} --default ${display(dirname(layer.dir))}\`.`
	}
	if (layer.tier === 'managed') return 'An admin rewrites it; `reference migrate` never changes a managed file.'
	return 'Run `reference migrate` to rewrite it.'
}

/** A skill's default in the old layout, `references/<name>.md`, is not read; it warns when the skill's folder has no default of the name (R119). */
function warnDefaultLayout(layer: ReferenceLayer, name: string, { display, without, warnAt }: ReadContext): void {
	const path = join(layer.dir, `${name}.md`)
	if (path === without || tryRead(path) === undefined) return
	warnLegacy(defaultLayoutFinding(name), legacyFix(layer, name, display), warnAt(display(path)))
}

/** A file filed under an older name applies as the new one, with a warning naming the file to rename (R97). */
function renamed(
	entry: ReferenceTraceLayer,
	as: string,
	name: string,
	path: string,
	display: (path: string) => string,
	warnAt: (where: string) => WarnFn,
): void {
	entry.alias = as
	warnAt(display(path))(
		'reference-renamed',
		`it is filed under the older name "${as}" and applies as "${name}"; rename it to the new name`,
	)
}

/**
 * A metadata file with `extends` and no data file beside it (R93): that tier's selection for a
 * non-Markdown name, which picks the stack and adds nothing, so the top step's file answers whole.
 */
function sidecarSelection(
	layer: ReferenceLayer,
	entry: ReferenceTraceLayer,
	sidecar: Sidecar,
	display: (path: string) => string,
	warnAt: (where: string) => WarnFn,
): Contribution {
	const label = contributionLabel(layer, sidecar.path, display)
	const steps = readExtends(sidecar.metadata['extends'], warnAt(label))
	Object.assign(entry, { path: sidecar.path, file: sidecar.file, frontmatter: sidecar.frontmatter, outcome: '' })
	if (typeof sidecar.metadata['description'] === 'string') entry.description = sidecar.metadata['description']
	entry.empty = true
	if (steps) entry.selection = true
	return {
		layer,
		entry,
		label,
		path: sidecar.path,
		metadata: sidecar.metadata,
		body: '',
		hasBody: false,
		format: 'markdown',
		whole: false,
		merge: undefined,
		steps,
	}
}

/** Every name a layer holds; empty for a layer that is missing, unreadable, or skipped. */
export function layerNames(layer: Pick<ReferenceLayer, 'tier' | 'dir' | 'skipped'>): string[] {
	if (layer.skipped) return []
	let entries: Dirent[]
	try {
		entries = readdirSync(layer.dir, { withFileTypes: true })
	} catch {
		return []
	}
	const names = new Set<string>()
	const isDefault = layer.tier === 'default'
	for (const entry of entries) {
		let name: string | undefined
		if (isDefault) {
			const suffix = [`${defaultSuffix}.md`, ...dataExtensions.map((item) => `${defaultSuffix}${item.extension}`)].find(
				(item) => entry.name.endsWith(item),
			)
			if (suffix) name = entry.name.slice(0, -suffix.length)
		} else if (
			!entry.isDirectory() &&
			['.md', ...dataExtensions.map((item) => item.extension)].some((extension) => entry.name.endsWith(extension))
		) {
			name = entry.name.slice(0, entry.name.lastIndexOf('.'))
		} else if (!entry.isFile() && tryRead(join(layer.dir, entry.name, 'README.md')) !== undefined) {
			name = entry.name
		}
		if (name === undefined || parseReferenceName(name).invalid) continue
		names.add(name)
	}
	return [...names]
}
