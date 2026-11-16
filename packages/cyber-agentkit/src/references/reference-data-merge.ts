import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { isRecord } from '../plugins/json-file.js'
import type { ReferenceFormat } from './reference-format.js'

/** The formats whose contributions merge key by key; TOML and plain text are answered whole. */
export function mergesByKey(format: ReferenceFormat): format is 'json' | 'yaml' {
	return format === 'json' || format === 'yaml'
}

/** Reads one data file; `problem` says why it does not parse or is not a mapping. */
export function parseData(
	text: string,
	format: 'json' | 'yaml',
): { value: Record<string, unknown> } | { problem: string } {
	let value: unknown
	try {
		value = format === 'json' ? JSON.parse(text) : parseYaml(text)
	} catch (error) {
		return { problem: `it is not ${format === 'json' ? 'JSON' : 'YAML'}: ${(error as Error).message.split('\n')[0]}` }
	}
	if (value === null || value === undefined) return { value: {} }
	if (!isRecord(value)) return { problem: 'it is not a mapping, so it cannot merge key by key' }
	return { value }
}

/**
 * `over` laid on `under`: mappings merge deeply, an array or a scalar replaces the lower value whole, and a `null`
 * removes the key.
 */
export function mergeData(under: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
	const merged: Record<string, unknown> = { ...under }
	for (const [key, value] of Object.entries(over)) {
		if (value === null) delete merged[key]
		else if (isRecord(value) && isRecord(merged[key]))
			merged[key] = mergeData(merged[key] as Record<string, unknown>, value)
		else merged[key] = value
	}
	return merged
}

/** The merged answer written out again; comments in the lower files do not survive. */
export function renderData(value: Record<string, unknown>, format: 'json' | 'yaml'): string {
	return format === 'json' ? `${JSON.stringify(value, null, 2)}\n` : stringifyYaml(value)
}

/** Merges two data files of one format into the text that answers; `problem` names the file that did not parse. */
export function mergeDataText(
	under: string,
	over: string,
	format: 'json' | 'yaml',
): { content: string } | { problem: 'under' | 'over'; why: string } {
	const low = parseData(under, format)
	if ('problem' in low) return { problem: 'under', why: low.problem }
	const high = parseData(over, format)
	if ('problem' in high) return { problem: 'over', why: high.problem }
	return { content: renderData(mergeData(low.value, high.value), format) }
}
