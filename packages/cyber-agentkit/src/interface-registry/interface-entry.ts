import { parse, stringify } from 'yaml'
import { isRecord } from '../plugins/json-file.js'
import { frontmatterPattern } from '../references/reference-document.js'

/** A named thing an entry points at: a plugin, an implementation, or a consuming skill. */
export type InterfaceLink = {
	name: string
	/** Where it lives. Left out when the entry only names it. */
	url?: string
}

/**
 * One registered reference interface: a pointer and a description, never the interface document
 * itself, which stays with the plugin that owns it. Only `id` is required.
 */
export type InterfaceEntry = {
	/** The name a skill uses to load the interface, and the entry's file name without `.md`. */
	id: string
	/** What the interface does, in one line. */
	description?: string
	/** The plugins that define it. */
	plugins?: InterfaceLink[]
	/** Known implementations. */
	implementations?: InterfaceLink[]
	/** Known usage: skills that consume it. */
	usage?: InterfaceLink[]
	tags?: string[]
	/** Such as `draft` or `stable`. */
	status?: string
	/** A link to the full interface document. */
	interface?: string
	/** Free prose: why the interface exists, how implementations differ. */
	body?: string
}

export type InterfaceEntryResult = { entry: InterfaceEntry; problems: string[] }

/** An id names a file and a reference: letters, digits, and `-`, `_`, or `.` between them. */
export const interfaceIdPattern: RegExp = /^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/

const linkLists = ['plugins', 'implementations', 'usage'] as const
const knownKeys = new Set(['id', 'description', 'tags', 'status', 'interface', ...linkLists])

function readLinks(value: unknown, key: string, problems: string[]): InterfaceLink[] | undefined {
	if (value === undefined || value === null) return undefined
	if (!Array.isArray(value)) {
		problems.push(`\`${key}\` is not a list`)
		return undefined
	}
	const links: InterfaceLink[] = []
	for (const item of value) {
		if (typeof item === 'string' && item.trim()) links.push({ name: item.trim() })
		else if (isRecord(item) && typeof item['name'] === 'string' && item['name'].trim()) {
			const url = item['url']
			if (url !== undefined && typeof url !== 'string')
				problems.push(`\`${key}\` entry \`${item['name']}\` has a url that is not text`)
			links.push(
				typeof url === 'string' && url.trim()
					? { name: item['name'].trim(), url: url.trim() }
					: { name: item['name'].trim() },
			)
		} else problems.push(`\`${key}\` holds an item that is neither a name nor {name, url}`)
	}
	return links.length ? links : undefined
}

function readText(metadata: Record<string, unknown>, key: string, problems: string[]): string | undefined {
	const value = metadata[key]
	if (value === undefined || value === null) return undefined
	if (typeof value !== 'string') {
		problems.push(`\`${key}\` is not text`)
		return undefined
	}
	return value.trim() || undefined
}

/**
 * Reads a registry entry from its Markdown text. `fileId`, the file name without `.md`, must match
 * the `id` in the header. Each problem is named; a field with a problem is left out.
 */
export function parseInterfaceEntry(text: string, fileId?: string): InterfaceEntryResult {
	const problems: string[] = []
	const match = frontmatterPattern.exec(text)
	let metadata: Record<string, unknown> = {}
	let body = text
	if (match) {
		body = text.slice(match[0].length)
		try {
			const value: unknown = parse(match[1] as string)
			if (isRecord(value)) metadata = value
			else if (value !== null && value !== undefined) problems.push('the header is not a YAML mapping')
		} catch {
			problems.push('the header is not valid YAML')
		}
	} else problems.push('the entry has no `---` header')

	const id = typeof metadata['id'] === 'string' ? metadata['id'].trim() : ''
	if (!id) problems.push('`id` is missing')
	else if (!interfaceIdPattern.test(id))
		problems.push(`\`id\` \`${id}\` holds a character other than letters, digits, \`-\`, \`_\`, or \`.\``)
	if (fileId !== undefined && id && id !== fileId)
		problems.push(`\`id\` \`${id}\` does not match the file name \`${fileId}.md\``)
	for (const key of Object.keys(metadata)) if (!knownKeys.has(key)) problems.push(`\`${key}\` is not an entry field`)

	const tagsValue = metadata['tags']
	let tags: string[] | undefined
	if (tagsValue !== undefined && tagsValue !== null) {
		if (Array.isArray(tagsValue) && tagsValue.every((tag) => typeof tag === 'string')) {
			tags = tagsValue.map((tag) => tag.trim()).filter(Boolean)
		} else problems.push('`tags` is not a list of words')
	}

	const entry: InterfaceEntry = { id: id || fileId || '' }
	const description = readText(metadata, 'description', problems)
	if (description) entry.description = description
	for (const key of linkLists) {
		const links = readLinks(metadata[key], key, problems)
		if (links) entry[key] = links
	}
	if (tags?.length) entry.tags = tags
	const status = readText(metadata, 'status', problems)
	if (status) entry.status = status
	const link = readText(metadata, 'interface', problems)
	if (link) entry.interface = link
	if (body.trim()) entry.body = body.trim()
	return { entry, problems }
}

/** The entry's Markdown text: the header, then the body. */
export function interfaceEntryText(entry: InterfaceEntry): string {
	const { body, ...header } = entry
	const ordered: Record<string, unknown> = { id: header.id }
	for (const key of ['description', 'plugins', 'implementations', 'usage', 'tags', 'status', 'interface'] as const) {
		if (header[key] !== undefined) ordered[key] = header[key]
	}
	return `---\n${stringify(ordered).trimEnd()}\n---\n${body ? `\n${body}\n` : ''}`
}

/** Every url the entry's header points at, with the field it sits in. */
export function interfaceEntryLinks(entry: InterfaceEntry): { field: string; url: string }[] {
	const links: { field: string; url: string }[] = []
	for (const key of linkLists) {
		for (const { name, url } of entry[key] ?? []) if (url) links.push({ field: `${key} ${name}`, url })
	}
	if (entry.interface) links.push({ field: 'interface', url: entry.interface })
	return links
}
