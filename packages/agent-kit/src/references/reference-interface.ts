import { isRecord } from '../plugins/json-file.js'
import { parseSections, type Section } from './reference-document.js'

/** `one`: the implementation is named `<id>`. `many`: each is named `<id>.<key>`. */
export type InterfaceCardinality = 'one' | 'many'

/** The machine-readable part of an interface document, read from its `interface:` frontmatter. */
export type ReferenceInterface = {
	id: string
	cardinality: InterfaceCardinality
	version: number
	/** The versions the owner's consumers accept; `[version]` when the document names none. */
	versions: number[]
	/** The implementation's top-level sections, in order. Every one is optional. Heading text is API. */
	sections: string[]
}

/** One `implements:` value, `<id>@<version>`. */
export type ImplementsEntry = { id: string; version: number }

export type InterfaceCheck = 'interface found' | 'version' | 'name' | 'order' | 'interface' | 'compose'

export type InterfaceCheckFailure = {
	check: InterfaceCheck
	/** The interface id the failure is about, when the document names one. */
	interface?: string
	message: string
}

export const interfaceSuffix = '.interface'

const implementsPattern = /^([a-z0-9]+(?:[-.][a-z0-9]+)*)@(\d+)$/i

/** The interface id an interface document's name declares, or `undefined` for any other name. */
export function interfaceIdOf(name: string): string | undefined {
	return name.endsWith(interfaceSuffix) && name.length > interfaceSuffix.length
		? name.slice(0, -interfaceSuffix.length)
		: undefined
}

function isVersion(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** A section is its heading text; a `required` mark on one is read and ignored, since every section is optional. */
function readSection(value: unknown): string | { problem: string } {
	if (typeof value === 'string' && value.trim()) return value.trim()
	if (isRecord(value)) {
		const keys = Object.keys(value)
		const [name] = keys
		if (keys.length === 1 && name?.trim()) return name.trim()
	}
	return { problem: `section ${JSON.stringify(value)} is not a heading name` }
}

function sectionKey(title: string): string {
	return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Reads the `interface:` block of an interface document. Problems are what `check` reports as a
 * malformed interface; a document with any problem has no `value`. A key it does not know is ignored.
 */
export function readInterface(
	id: string,
	metadata: Record<string, unknown>,
): { value?: ReferenceInterface; problems: string[] } {
	const block = metadata['interface']
	if (!isRecord(block)) {
		return {
			problems: [
				block === undefined ? 'has no `interface:` block in its frontmatter' : '`interface:` is not a mapping',
			],
		}
	}
	const problems: string[] = []
	const cardinality = block['cardinality']
	if (cardinality !== 'one' && cardinality !== 'many') {
		problems.push(`cardinality is ${JSON.stringify(cardinality)}; it is one or many`)
	}
	const version = block['version']
	if (!isVersion(version)) problems.push(`version is ${JSON.stringify(version)}; it is a positive integer`)
	const versionsValue = block['versions']
	let versions: number[] = isVersion(version) ? [version] : []
	if (versionsValue !== undefined) {
		if (Array.isArray(versionsValue) && versionsValue.length && versionsValue.every(isVersion)) versions = versionsValue
		else problems.push('versions is not a list of positive integers')
	}
	const sectionsValue = block['sections']
	const sections: string[] = []
	if (!Array.isArray(sectionsValue) || !sectionsValue.length) problems.push('sections is not a list of headings')
	else {
		const seen = new Set<string>()
		for (const item of sectionsValue) {
			const section = readSection(item)
			if (typeof section !== 'string') {
				problems.push(section.problem)
				continue
			}
			const key = sectionKey(section)
			if (seen.has(key)) problems.push(`section "${section}" is listed more than once`)
			seen.add(key)
			sections.push(section)
		}
	}
	if (problems.length) return { problems }
	return {
		value: { id, cardinality: cardinality as InterfaceCardinality, version: version as number, versions, sections },
		problems,
	}
}

/**
 * Reads `implements:`, one `<id>@<version>`. A list of one is read as that one; a list of more names
 * more than one interface, which an implementation does not do.
 */
export function readImplements(metadata: Record<string, unknown>): { entry?: ImplementsEntry; problems: string[] } {
	const value = metadata['implements']
	if (value === undefined) return { problems: [] }
	const list: unknown[] = Array.isArray(value) ? value : [value]
	if (list.length !== 1) {
		return {
			problems: [
				list.length
					? `implements lists ${list.length} interfaces; an implementation implements one`
					: 'implements is an empty list',
			],
		}
	}
	const [item] = list
	const match = typeof item === 'string' ? implementsPattern.exec(item.trim()) : null
	if (!match) return { problems: [`implements ${JSON.stringify(item)} is not <id>@<version>`] }
	return { entry: { id: match[1] as string, version: Number(match[2]) }, problems: [] }
}

/** Whether a name fits an interface's cardinality: `<id>` for one, `<id>.<key>` for many. */
export function fitsName(iface: Pick<ReferenceInterface, 'id' | 'cardinality'>, name: string): boolean {
	if (iface.cardinality === 'one') return name === iface.id
	return name.startsWith(`${iface.id}.`) && name.length > iface.id.length + 1 && !name.endsWith(interfaceSuffix)
}

export type DocumentSection = { title: string; unsupported: boolean }

/** Every top-level heading outside a code fence, in order, and whether its first line is `**Unsupported.**`. */
export function documentSections(content: string): DocumentSection[] {
	const found: DocumentSection[] = []
	const visit = (section: Section) => {
		if (section.depth === 0) {
			const first = section.text.find((line) => line.trim())
			found.push({ title: section.title, unsupported: first?.trim().startsWith('**Unsupported.**') ?? false })
		}
		for (const child of section.children) visit(child)
	}
	for (const section of parseSections(content, () => {}).children) visit(section)
	return found
}

export type ImplementationFacts = {
	name: string
	version: number
	/** The composed document. */
	content: string
	/** The versions to accept; the interface's own `versions` when omitted. */
	accept?: readonly number[] | undefined
}

/**
 * Checks one composed implementation against its interface. Every section is optional, and a
 * section the interface does not list may sit anywhere; `order` compares only the listed ones.
 * `unsupported` lists the listed sections it marks `**Unsupported.**` or leaves out, in order.
 */
export function checkImplementation(
	iface: ReferenceInterface,
	{ name, version, content, accept = iface.versions }: ImplementationFacts,
): { failures: InterfaceCheckFailure[]; unsupported: string[] } {
	const failures: InterfaceCheckFailure[] = []
	const fail = (check: InterfaceCheck, message: string) => failures.push({ check, interface: iface.id, message })
	if (!accept.includes(version)) fail('version', `unknown version ${version}`)
	if (!fitsName(iface, name)) {
		fail('name', `name ${name} is not ${iface.cardinality === 'one' ? iface.id : `${iface.id}.<key>`}`)
	}
	const sections = documentSections(content)
	const declared = iface.sections.map(sectionKey)
	const unsupported = iface.sections.filter((section) => {
		const present = sections.find((candidate) => sectionKey(candidate.title) === sectionKey(section))
		return !present || present.unsupported
	})
	let last = -1
	let lastTitle = ''
	const seen = new Set<string>()
	for (const section of sections) {
		const key = sectionKey(section.title)
		const index = declared.indexOf(key)
		if (index === -1) continue
		if (seen.has(key)) fail('order', `section ${section.title} appears more than once`)
		else if (index < last) fail('order', `section ${section.title} comes after ${lastTitle}`)
		seen.add(key)
		if (index > last) {
			last = index
			lastTitle = section.title
		}
	}
	return { failures, unsupported }
}
