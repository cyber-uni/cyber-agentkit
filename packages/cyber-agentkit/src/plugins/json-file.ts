import { readFile } from 'node:fs/promises'

/** Read a file, or `undefined` when it does not exist. Other read errors are thrown. */
export async function readText(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, 'utf8')
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
}

/** Strip comments and trailing commas from JSON with comments, leaving string contents intact. */
export function stripJsonComments(text: string): string {
	let out = ''
	let i = 0
	while (i < text.length) {
		const char = text[i] as string
		if (char === '"') {
			let end = i + 1
			while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
			out += text.slice(i, end + 1)
			i = end + 1
		} else if (char === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++
		} else if (char === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2)
			i = end === -1 ? text.length : end + 2
		} else {
			out += char
			i++
		}
	}
	return out.replace(/,(\s*[}\]])/g, '$1')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
