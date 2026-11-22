// Builds the registry areas: interfaces from `registry/interfaces/*.md` and capability references from
// `registry/capabilities/*.md`. Each area gets one show page per entry under `src/content/docs/<area>/` and
// the list page's data in `src/generated/<area>.json`. All are gitignored. Any malformed entry or broken
// header link fails the build, naming the entry. A folder that does not exist yet is an empty area.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { capabilityEntryLinks, interfaceEntryLinks, parseCapabilityEntry, parseInterfaceEntry } from 'cyber-agentkit'
import {
	capabilityListRow,
	checkEntryLinks,
	listRow,
	pageSlug,
	problemMessages,
	renderCapabilityPage,
	renderEntryPage,
} from './registry-lib.mjs'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(web, '../..')

const areas = [
	{
		name: 'Interface',
		folder: 'interfaces',
		parse: parseInterfaceEntry,
		key: (entry) => entry.id,
		links: interfaceEntryLinks,
		page: renderEntryPage,
		row: listRow,
	},
	{
		name: 'Capability',
		folder: 'capabilities',
		parse: parseCapabilityEntry,
		key: (entry) => entry.system,
		links: capabilityEntryLinks,
		page: renderCapabilityPage,
		row: capabilityListRow,
	},
]

const failures = []
const built = []
for (const area of areas) {
	const source = join(repo, 'registry', area.folder)
	const files = existsSync(source)
		? readdirSync(source, { withFileTypes: true })
				.filter((file) => file.isFile() && file.name.endsWith('.md'))
				.map((file) => file.name)
				.sort()
		: []
	const entries = []
	for (const file of files) {
		const { entry, problems } = area.parse(readFileSync(join(source, file), 'utf8'), file.replace(/\.md$/, ''))
		if (problems.length > 0 || !entry) {
			failures.push(...problemMessages(`registry/${area.folder}/${file}`, problems))
			continue
		}
		entries.push(entry)
	}
	const linkFailures = await Promise.all(
		entries.map((entry) => checkEntryLinks({ id: area.key(entry) }, area.links(entry), { repo })),
	)
	failures.push(...linkFailures.flat())
	built.push({ area, entries })
}

if (failures.length > 0) {
	console.error(`Registry check failed:\n${failures.map((failure) => `  ${failure}`).join('\n')}`)
	process.exit(1)
}

for (const { area, entries } of built) {
	const pages = join(web, 'src/content/docs', area.folder)
	const data = join(web, 'src/generated', `${area.folder}.json`)
	rmSync(pages, { recursive: true, force: true })
	mkdirSync(pages, { recursive: true })
	for (const entry of entries) writeFileSync(join(pages, `${pageSlug(area.key(entry))}.md`), area.page(entry))
	mkdirSync(dirname(data), { recursive: true })
	writeFileSync(data, `${JSON.stringify(entries.map(area.row), null, '\t')}\n`)
}
