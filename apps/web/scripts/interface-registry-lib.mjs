// Pure logic for the interface registry generator: local-path mapping for this repo's own GitHub urls,
// and the link checks, with `fetch` injected so tests never touch the network.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const own = /^https:\/\/github\.com\/cyber-uni\/cyber-agentkit\/(?:blob|tree)\/main\/(.+)$/

/** The repo-relative path a url of this repo's own `main` branch points at, or undefined for any other url. */
export function localPath(url) {
	const match = own.exec(url)
	if (!match) return undefined
	return decodeURIComponent(match[1].replace(/[?#].*$/, '')).replace(/\/+$/, '')
}

async function request(fetchFn, url, method) {
	return fetchFn(url, { method, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
}

/** Whether an external url answers: HEAD, then GET when HEAD is refused, one retry. 404/410 and network failures fail. */
export async function checkExternal(url, fetchFn = fetch) {
	let last = ''
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			let res = await request(fetchFn, url, 'HEAD')
			if (res.status === 405 || res.status === 403) res = await request(fetchFn, url, 'GET')
			if (res.status === 404 || res.status === 410) return `answers ${res.status}`
			return undefined
		} catch (error) {
			last = `could not be reached (${error instanceof Error ? error.message : String(error)})`
		}
	}
	return last
}

/** Check one entry's links. Returns one message per broken link, naming the entry, the field and the url. */
export async function checkEntryLinks(entry, links, { repo, fetchFn = fetch } = {}) {
	const results = await Promise.all(
		links.map(async ({ field, url }) => {
			const path = localPath(url)
			let why
			if (path !== undefined)
				why = existsSync(join(repo, path)) ? undefined : `no such file or folder in the repo (${path})`
			else if (/^https?:\/\//.test(url)) why = await checkExternal(url, fetchFn)
			return why ? `${entry.id}: ${field} ${url} ${why}` : undefined
		}),
	)
	return results.filter(Boolean)
}

/** Messages for the problems `parseInterfaceEntry` reported, each naming the entry file. */
export function problemMessages(file, problems) {
	return problems.map((problem) => `${file}: ${problem}`)
}

const link = (item) => (item.url ? `[${item.name}](${item.url})` : item.name)
const list = (items) => items.map((item) => `- ${link(item)}`).join('\n')

/** The show page for one entry. Only the fields that are set appear. */
export function renderEntryPage(entry) {
	const sections = []
	if (entry.description) sections.push(entry.description)
	if (entry.status) sections.push(`**Status:** ${entry.status}`)
	if (entry.tags?.length) sections.push(`**Tags:** ${entry.tags.join(', ')}`)
	if (entry.plugins?.length) sections.push(`## Defined by\n\n${list(entry.plugins)}`)
	if (entry.implementations?.length) sections.push(`## Implementations\n\n${list(entry.implementations)}`)
	if (entry.usage?.length) sections.push(`## Used by\n\n${list(entry.usage)}`)
	if (entry.interface) sections.push(`## Interface document\n\n[${entry.interface}](${entry.interface})`)
	if (entry.body?.trim()) sections.push(entry.body.trim())
	sections.push(
		`[Edit this entry on GitHub](https://github.com/cyber-uni/cyber-agentkit/blob/main/registry/interfaces/${entry.id}.md)`,
	)
	const front = ['---', `title: ${JSON.stringify(entry.id)}`]
	if (entry.description) front.push(`description: ${JSON.stringify(entry.description)}`)
	front.push('---')
	return `${front.join('\n')}\n\n${sections.join('\n\n')}\n`
}

/** The page name for an id. Dots become dashes because Starlight's slugger would drop them from the url. */
export const pageSlug = (id) => id.replaceAll('.', '-')

/** The row the list page reads. */
export function listRow(entry) {
	return {
		id: entry.id,
		slug: pageSlug(entry.id),
		description: entry.description ?? '',
		tags: entry.tags ?? [],
		status: entry.status ?? '',
		plugins: (entry.plugins ?? []).map((plugin) => plugin.name),
	}
}
