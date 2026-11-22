import { isRecord } from '../plugins/json-file.js'
import { type InterfaceEntry, parseInterfaceEntry } from './interface-entry.js'

/** The repository that holds the registry, its branch, and the folder of entries in it. */
export const interfaceRegistry = {
	owner: 'cyber-uni',
	repo: 'cyber-agentkit',
	branch: 'main',
	folder: 'registry/interfaces',
} as const

/** One area of the registry: its folder, and how a request to it names what it registers. */
export type RegistryArea = {
	folder: string
	/** What one entry registers, in a request: `reference interface`, `capability reference`. */
	noun: string
	/** The shorter noun a pull request title uses. */
	short: string
	/** The noun counted in the lookup summary, singular and plural. */
	counted: readonly [string, string]
	/** The branch prefix a pull request's branch uses in the fork. */
	branch: string
}

/** The interface area of the registry. */
export const interfaceArea: RegistryArea = {
	folder: interfaceRegistry.folder,
	noun: 'reference interface',
	short: 'interface',
	counted: ['interface', 'interfaces'],
	branch: 'register-interface',
}

/** The web page of one registry folder. */
export function registryFolderUrl(folder: string): string {
	return `https://github.com/${interfaceRegistry.owner}/${interfaceRegistry.repo}/tree/${interfaceRegistry.branch}/${folder}`
}

/** The web page of one entry's file in a registry folder. */
export function registryFileUrl(folder: string, name: string): string {
	return `https://github.com/${interfaceRegistry.owner}/${interfaceRegistry.repo}/blob/${interfaceRegistry.branch}/${folder}/${name}.md`
}

/** The web page of the registry folder. */
export const interfaceRegistryUrl: string = registryFolderUrl(interfaceRegistry.folder)

/** The web page of one entry's file. */
export function interfaceEntryUrl(id: string): string {
	return registryFileUrl(interfaceRegistry.folder, id)
}

/** The slice of `fetch` the registry reads with, so a caller or a test can give its own. */
export type RegistryFetch = (
	url: string,
	init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

/** The registry could not be read: no network, or the host refused. Nothing should be decided from it. */
export class RegistryUnreachable extends Error {
	override name = 'RegistryUnreachable'
}

export type RegistryRead<Entry = InterfaceEntry> = {
	entries: Entry[]
	/** An entry file the registry holds but that has problems, named by its file; it is still compared. */
	invalid: { id: string; problems: string[] }[]
}

const headers = { accept: 'application/vnd.github+json', 'user-agent': 'cyber-agentkit' }

/**
 * Reads every entry from the registry folder in the live repository, so the lookup is always
 * current. It needs a network: when the host cannot be reached it throws `RegistryUnreachable`
 * rather than answer from a guess. A registry folder that does not exist yet reads as empty.
 */
export async function readInterfaceRegistry(
	fetcher: RegistryFetch = globalThis.fetch as RegistryFetch,
): Promise<RegistryRead> {
	return readRegistryFolder(interfaceRegistry.folder, parseInterfaceEntry, (entry) => entry.id, fetcher)
}

/**
 * Reads every `.md` entry of one registry folder in the live repository with `parse`, which takes
 * the text and the file name without `.md`. Entries come sorted by `key`. Throws
 * `RegistryUnreachable` when the host cannot be reached; a folder that does not exist reads as empty.
 */
export async function readRegistryFolder<Entry>(
	folder: string,
	parse: (text: string, fileId: string) => { entry: Entry; problems: string[] },
	key: (entry: Entry) => string,
	fetcher: RegistryFetch = globalThis.fetch as RegistryFetch,
): Promise<RegistryRead<Entry>> {
	const { owner, repo, branch } = interfaceRegistry
	const listing = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}?ref=${branch}`
	let files: { id: string; url: string }[]
	try {
		const response = await fetcher(listing, { headers })
		if (response.status === 404) return { entries: [], invalid: [] }
		if (!response.ok) throw new RegistryUnreachable(`GitHub answered ${response.status} for the registry folder`)
		const value = await response.json()
		if (!Array.isArray(value)) throw new RegistryUnreachable('GitHub did not answer with the registry folder listing')
		files = value
			.filter(isRecord)
			.filter((item) => item['type'] === 'file' && typeof item['name'] === 'string' && item['name'].endsWith('.md'))
			.map((item) => ({
				id: (item['name'] as string).slice(0, -3),
				url:
					typeof item['download_url'] === 'string'
						? item['download_url']
						: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${folder}/${item['name'] as string}`,
			}))
	} catch (error) {
		if (error instanceof RegistryUnreachable) throw error
		throw new RegistryUnreachable(`cannot reach GitHub: ${error instanceof Error ? error.message : String(error)}`)
	}
	const entries: Entry[] = []
	const invalid: RegistryRead['invalid'] = []
	await Promise.all(
		files.map(async ({ id, url }) => {
			let text: string
			try {
				const response = await fetcher(url, { headers: { 'user-agent': headers['user-agent'] } })
				if (!response.ok) throw new RegistryUnreachable(`GitHub answered ${response.status} for the entry ${id}`)
				text = await response.text()
			} catch (error) {
				if (error instanceof RegistryUnreachable) throw error
				throw new RegistryUnreachable(`cannot reach GitHub: ${error instanceof Error ? error.message : String(error)}`)
			}
			const { entry, problems } = parse(text, id)
			entries.push(entry)
			if (problems.length) invalid.push({ id, problems })
		}),
	)
	entries.sort((a, b) => key(a).localeCompare(key(b)))
	invalid.sort((a, b) => a.id.localeCompare(b.id))
	return { entries, invalid }
}
