import { isRecord } from '../plugins/json-file.js'
import { type InterfaceEntry, parseInterfaceEntry } from './interface-entry.js'

/** The repository that holds the registry, its branch, and the folder of entries in it. */
export const interfaceRegistry = {
	owner: 'cyber-uni',
	repo: 'cyber-agentkit',
	branch: 'main',
	folder: 'registry/interfaces',
} as const

/** The web page of the registry folder. */
export const interfaceRegistryUrl = `https://github.com/${interfaceRegistry.owner}/${interfaceRegistry.repo}/tree/${interfaceRegistry.branch}/${interfaceRegistry.folder}`

/** The web page of one entry's file. */
export function interfaceEntryUrl(id: string): string {
	return `https://github.com/${interfaceRegistry.owner}/${interfaceRegistry.repo}/blob/${interfaceRegistry.branch}/${interfaceRegistry.folder}/${id}.md`
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

export type RegistryRead = {
	entries: InterfaceEntry[]
	/** An entry file the registry holds but that has problems; it is still compared by its id. */
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
	const { owner, repo, branch, folder } = interfaceRegistry
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
	const entries: InterfaceEntry[] = []
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
			const { entry, problems } = parseInterfaceEntry(text, id)
			entries.push(entry)
			if (problems.length) invalid.push({ id, problems })
		}),
	)
	entries.sort((a, b) => a.id.localeCompare(b.id))
	invalid.sort((a, b) => a.id.localeCompare(b.id))
	return { entries, invalid }
}
