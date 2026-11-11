import { ReferenceFailure } from './reference-error.js'
import { dataExtensions } from './reference-format.js'

export type ReferenceName = {
	/** As asked. */
	raw: string
	/** The bare name. */
	name: string
	/** The plugin a qualified `<plugin>/<name>` asks for, by its manifest's `name`. */
	plugin?: string | undefined
	/** Why the value is not a reference name. Set only on an invalid one; nothing is read for it. */
	invalid?: string | undefined
}

export const namePattern: RegExp = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/i

export const defaultSuffix = '.default'

/** The suffix a metadata file's name carries before `.md` (K31); a name ending in it is reserved for that file. */
export const metadataSuffix = '.meta'

/** The suffix that makes a name a family (K39): `<prefix>.*`. */
export const familySuffix = '.*'

/** A family name as a template type, so a call written with one literal is typed as the family's call. */
export type FamilyName = `${string}.*`

/** Whether a value is written as a family: it ends in `.*`. Its prefix may still be invalid (R136). */
export function isFamilyName(value: string): value is FamilyName {
	return value.endsWith(familySuffix)
}

/**
 * The prefix of a family (K39), or why the value is not one. `*` anywhere but the last segment, a
 * qualified or file-like prefix, or an empty prefix makes the name invalid (R136).
 */
export function parseFamily(value: string): { prefix: string; invalid?: undefined } | { invalid: string } {
	const prefix = value.slice(0, -familySuffix.length)
	if (!isFamilyName(value) || !prefix || prefix.includes('*') || !namePattern.test(prefix)) {
		return {
			invalid: `"${value}" is not a family. A family is \`<prefix>.*\`, with \`*\` only as the last segment and a prefix of letters, digits, hyphens, and dots.`,
		}
	}
	return { prefix }
}

/** No name at all is a usage error (`name-missing`), unlike a string that is not a name, which is `invalid`. */
export function requireName(value: string): void {
	if (!value.trim()) {
		throw new ReferenceFailure('name-missing', 'name a reference.', {
			help: 'Run `reference list` for every name.',
		})
	}
}

/**
 * Rejects rather than sanitizes — silently answering a different question is how untrusted input
 * reads a file outside a layer. The plugin qualifier is only ever compared with plugin names, never
 * joined into a path. A bad name comes back `invalid`, never thrown, so the other names still resolve.
 */
export function parseReferenceName(value: string): ReferenceName {
	const invalid = (reason: string): ReferenceName => ({ raw: value, name: value, invalid: reason })
	if (value.endsWith('.md')) {
		return invalid(`"${value}" names a file. Ask for the reference by name, without the .md extension.`)
	}
	const extension = dataExtensions.find((item) => value.endsWith(item.extension))
	if (extension) {
		return invalid(
			`"${value}" names a file. Ask for the reference by name, without the ${extension.extension} extension.`,
		)
	}
	if (value.includes('*')) {
		return invalid(
			`"${value}" is not a reference name: \`*\` makes a family, \`<prefix>.*\`, which only customize and implementations take.`,
		)
	}
	const parts = value.split('/')
	if (parts.length > 2 || value.includes('\\')) {
		return invalid(`"${value}" is a path. A name is letters, digits, hyphens, and dots, optionally after "<plugin>/".`)
	}
	const [first, second] = parts as [string, string | undefined]
	const name = second ?? first
	const plugin = second === undefined ? undefined : first
	if (name.endsWith(defaultSuffix)) {
		return invalid(
			`"${value}" names a skill's default file. Ask for "${name.slice(0, -defaultSuffix.length)}"; the default joins when its skill loads it.`,
		)
	}
	if (name.endsWith(metadataSuffix)) {
		return invalid(
			`"${value}" names a metadata file, which never answers a name. Ask for "${name.slice(0, -metadataSuffix.length)}".`,
		)
	}
	if (!namePattern.test(name) || (plugin !== undefined && !namePattern.test(plugin))) {
		return invalid(
			`"${value}" is not a reference name. A name is letters, digits, hyphens, and dots, optionally after "<plugin>/", where <plugin> is a plugin's manifest name.`,
		)
	}
	return plugin === undefined ? { raw: value, name } : { raw: value, name, plugin }
}
