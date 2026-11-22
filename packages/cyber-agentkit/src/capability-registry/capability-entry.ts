import { stringify } from 'yaml'
import {
	type InterfaceLink,
	readEntryHeader,
	readLinks,
	readTags,
	readText,
} from '../interface-registry/interface-entry.js'
import { capabilitiesSuffix } from '../references/reference-capabilities.js'

/**
 * One registered system: who ships its capability reference, `<system>.capabilities`, and which
 * blueprints build on it (decision 0008). A pointer and a description, never the reference itself,
 * which stays with each plugin that ships it. Only `system` is required.
 */
export type CapabilityEntry = {
	/** The system's name, the `<system>` of `<system>.capabilities`, and the entry's file name without `.md`. */
	system: string
	/** What the system is, in one line. */
	description?: string
	/** The plugins that ship its capability reference. */
	plugins?: InterfaceLink[]
	/** The blueprints built on it, each by its full name, `<interface>.<system>.<solution>`. */
	blueprints?: InterfaceLink[]
	tags?: string[]
	/** Such as `draft` or `stable`. */
	status?: string
	/** Free prose: how the plugins' capability references differ, what a blueprint is for. */
	body?: string
}

export type CapabilityEntryResult = { entry: CapabilityEntry; problems: string[] }

/** A system is one name segment: letters, digits, and `-` or `_` between them, no dot (K40). */
export const capabilitySystemPattern: RegExp = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/

const linkLists = ['plugins', 'blueprints'] as const
const knownKeys = new Set(['system', 'description', 'tags', 'status', ...linkLists])

const blueprintsInfix = '.blueprints.'

/**
 * The system a blueprint's name builds on, or `undefined` when the name is not a blueprint's:
 * `<interface>.blueprints.<system>.<solution>`, where the last `.blueprints.` ends the interface id
 * (K41). Plain string steps, so no name can make it slow.
 */
export function blueprintSystemOf(name: string): string | undefined {
	if (name.includes('/')) return undefined
	const at = name.lastIndexOf(blueprintsInfix)
	if (at <= 0) return undefined
	const key = name.slice(at + blueprintsInfix.length)
	const dot = key.indexOf('.')
	if (dot <= 0 || dot === key.length - 1) return undefined
	return key.slice(0, dot)
}

/** The capability reference an entry registers: `<system>.capabilities`. */
export function capabilityReferenceName(system: string): string {
	return `${system}${capabilitiesSuffix}`
}

/**
 * Reads a capability registry entry from its Markdown text. `fileSystem`, the file name without
 * `.md`, must match `system`. A blueprint the entry lists must be named for this system. Each
 * problem is named; a field with a problem is left out.
 */
export function parseCapabilityEntry(text: string, fileSystem?: string): CapabilityEntryResult {
	const { metadata, body, problems } = readEntryHeader(text)

	const system = typeof metadata['system'] === 'string' ? metadata['system'].trim() : ''
	if (!system) problems.push('`system` is missing')
	else if (!capabilitySystemPattern.test(system))
		problems.push(
			`\`system\` \`${system}\` is not one name segment: use letters, digits, and \`-\` or \`_\` between them, no dot`,
		)
	if (fileSystem !== undefined && system && system !== fileSystem)
		problems.push(`\`system\` \`${system}\` does not match the file name \`${fileSystem}.md\``)
	for (const key of Object.keys(metadata)) if (!knownKeys.has(key)) problems.push(`\`${key}\` is not an entry field`)

	const entry: CapabilityEntry = { system: system || fileSystem || '' }
	const description = readText(metadata, 'description', problems)
	if (description) entry.description = description
	for (const key of linkLists) {
		const links = readLinks(metadata[key], key, problems)
		if (links) entry[key] = links
	}
	for (const { name } of entry.blueprints ?? []) {
		const builtOn = blueprintSystemOf(name)
		if (builtOn !== entry.system)
			problems.push(
				`\`blueprints\` entry \`${name}\` is not a blueprint of \`${entry.system}\`: name it \`<interface>.blueprints.${entry.system}.<solution>\``,
			)
	}
	const tags = readTags(metadata, problems)
	if (tags) entry.tags = tags
	const status = readText(metadata, 'status', problems)
	if (status) entry.status = status
	if (body.trim()) entry.body = body.trim()
	return { entry, problems }
}

/** The entry's Markdown text: the header, then the body. */
export function capabilityEntryText(entry: CapabilityEntry): string {
	const { body, ...header } = entry
	const ordered: Record<string, unknown> = { system: header.system }
	for (const key of ['description', 'plugins', 'blueprints', 'tags', 'status'] as const) {
		if (header[key] !== undefined) ordered[key] = header[key]
	}
	return `---\n${stringify(ordered).trimEnd()}\n---\n${body ? `\n${body}\n` : ''}`
}

/** Every url the entry's header points at, with the field it sits in. */
export function capabilityEntryLinks(entry: CapabilityEntry): { field: string; url: string }[] {
	const links: { field: string; url: string }[] = []
	for (const key of linkLists) {
		for (const { name, url } of entry[key] ?? []) if (url) links.push({ field: `${key} ${name}`, url })
	}
	return links
}
