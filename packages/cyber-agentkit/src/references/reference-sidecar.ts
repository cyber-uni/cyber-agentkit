import { join } from 'node:path'
import type { WarnFn } from './reference-codes.js'
import { hasBody, parseDocument } from './reference-document.js'
import type { ReferenceFormat } from './reference-format.js'
import type { ReferenceLayer } from './reference-layers.js'
import { defaultSuffix, metadataSuffix } from './reference-name.js'

/** Keys a metadata file cannot carry: a non-Markdown contribution always replaces below (R68), and an interface's sections are Markdown. */
const ignoredKeys = ['merge', 'implements'] as const

/** The metadata file beside a contribution of `name` in a layer: `<name>.meta.md`, or a default's `<name>.default.meta.md`. */
export function sidecarFile(layer: Pick<ReferenceLayer, 'tier'>, name: string): string {
	return `${name}${layer.tier === 'default' ? defaultSuffix : ''}${metadataSuffix}.md`
}

/** A metadata file read beside a contribution (K31). */
export type Sidecar = {
	path: string
	/** Its file name in the folder, such as `<name>.meta.md`. */
	file: string
	/** Its frontmatter as written. */
	frontmatter: Record<string, unknown>
	/** What applies: the frontmatter without `merge` and `implements`. */
	metadata: Record<string, unknown>
	/** It writes `extends`, so with no data file beside it, it is that tier's selection for the name (R93). */
	selects: boolean
}

type SidecarContext = {
	/** A file read as absent. */
	without: string | undefined
	display: (path: string) => string
	warnAt: (where: string) => WarnFn
	read: (path: string) => string | undefined
}

/**
 * Reads the metadata file beside a contribution of `name` (R94). It applies only beside a
 * non-Markdown file, or alone when it writes `extends` (a selection, R93); otherwise it is ignored
 * with a `metadata-ignored` warning. A body, `merge`, or `implements` in it is ignored with the same
 * warning, and the rest of its frontmatter still applies. It never answers a name itself (R65).
 */
export function readSidecar(
	layer: Pick<ReferenceLayer, 'tier' | 'dir'>,
	name: string,
	answering: ReferenceFormat | undefined,
	{ without, display, warnAt, read }: SidecarContext,
): Sidecar | undefined {
	const file = sidecarFile(layer, name)
	const path = join(layer.dir, file)
	const raw = path === without ? undefined : read(path)
	if (raw === undefined) return undefined
	const warn = warnAt(display(path))
	if (answering === 'markdown') {
		warn(
			'metadata-ignored',
			'it is ignored: a metadata file goes beside a non-Markdown file, and a Markdown contribution carries its keys in its own frontmatter',
		)
		return undefined
	}
	const { metadata: frontmatter, body } = parseDocument(raw, warn)
	const selects = frontmatter['extends'] !== undefined
	if (answering === undefined && !selects) {
		warn(
			'metadata-ignored',
			`it is ignored: no non-Markdown file for "${name}" is beside it, and it writes no extends to select one`,
		)
		return undefined
	}
	if (hasBody(body)) warn('metadata-ignored', 'its body is ignored: a metadata file holds frontmatter only')
	const metadata = { ...frontmatter }
	for (const key of ignoredKeys) {
		if (!(key in metadata)) continue
		delete metadata[key]
		warn(
			'metadata-ignored',
			key === 'merge'
				? '`merge` in it is ignored: a non-Markdown contribution always replaces what is below it'
				: "`implements` in it is ignored: an interface's sections are Markdown",
		)
	}
	return { path, file, frontmatter, metadata, selects }
}
