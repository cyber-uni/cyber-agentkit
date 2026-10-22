/** The format of a reference file: `markdown`, or the extension of a data file. */
export type ReferenceFormat = 'markdown' | 'json' | 'yaml' | 'toml' | 'txt'

/** Extensions other than Markdown that answer a name, in the order they answer within one folder. */
export const dataExtensions: readonly { extension: string; format: Exclude<ReferenceFormat, 'markdown'> }[] = [
	{ extension: '.json', format: 'json' },
	{ extension: '.yaml', format: 'yaml' },
	{ extension: '.yml', format: 'yaml' },
	{ extension: '.toml', format: 'toml' },
	{ extension: '.txt', format: 'txt' },
]

/** The format a file name holds, by its extension; Markdown for `.md` and a folder's `README.md`. */
export function formatOfFile(file: string): ReferenceFormat {
	return dataExtensions.find(({ extension }) => file.endsWith(extension))?.format ?? 'markdown'
}
