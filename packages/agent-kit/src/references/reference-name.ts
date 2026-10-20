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
	if (!namePattern.test(name) || (plugin !== undefined && !namePattern.test(plugin))) {
		return invalid(
			`"${value}" is not a reference name. A name is letters, digits, hyphens, and dots, optionally after "<plugin>/", where <plugin> is a plugin's manifest name.`,
		)
	}
	return plugin === undefined ? { raw: value, name } : { raw: value, name, plugin }
}
