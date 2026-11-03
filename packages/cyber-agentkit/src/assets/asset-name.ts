export type AssetFormat = 'markdown' | 'json' | 'yaml' | 'toml' | 'txt'

/** Extensions that answer an asset name, in the order they answer within one folder (after `.md`). */
export const assetDataExtensions: readonly { extension: string; format: Exclude<AssetFormat, 'markdown'> }[] = [
	{ extension: '.json', format: 'json' },
	{ extension: '.yaml', format: 'yaml' },
	{ extension: '.yml', format: 'yaml' },
	{ extension: '.toml', format: 'toml' },
	{ extension: '.txt', format: 'txt' },
]

/** The format a file name holds, by its extension; Markdown for `.md`. */
export function formatOfAssetFile(file: string): AssetFormat {
	return assetDataExtensions.find(({ extension }) => file.endsWith(extension))?.format ?? 'markdown'
}

export type AssetName = {
	/** As asked. */
	raw: string
	/** The bare name. */
	name: string
	/** The plugin a qualified `<plugin>/<name>` asks for, by its manifest's `name`. */
	plugin?: string | undefined
	/** Why the value is not an asset name. Set only on an invalid one; nothing is read for it. */
	invalid?: string | undefined
}

export const assetNamePattern: RegExp = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/i

const defaultSuffix = '.default'

/**
 * Rejects rather than sanitizes: silently answering a different question is how untrusted input reads
 * a file outside a layer. A bad name comes back `invalid`, never thrown.
 */
export function parseAssetName(value: string): AssetName {
	const invalid = (reason: string): AssetName => ({ raw: value, name: value, invalid: reason })
	if (value.endsWith('.md')) {
		return invalid(`"${value}" names a file. Ask for the reference by name, without the .md extension.`)
	}
	const extension = assetDataExtensions.find((item) => value.endsWith(item.extension))
	if (extension) {
		return invalid(
			`"${value}" names a file. Ask for the reference by name, without the ${extension.extension} extension.`,
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
	if (!assetNamePattern.test(name) || (plugin !== undefined && !assetNamePattern.test(plugin))) {
		return invalid(
			`"${value}" is not a reference name. A name is letters, digits, hyphens, and dots, optionally after "<plugin>/", where <plugin> is a plugin's manifest name.`,
		)
	}
	return plugin === undefined ? { raw: value, name } : { raw: value, name, plugin }
}
