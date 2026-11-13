// Builds the interface registry area from `registry/interfaces/*.md`: one show page per entry under
// `src/content/docs/interfaces/` and the list page's data in `src/generated/interfaces.json`. Both are
// gitignored. Any malformed entry or broken header link fails the build, naming the entry.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { interfaceEntryLinks, parseInterfaceEntry } from 'cyber-agentkit'
import { checkEntryLinks, listRow, pageSlug, problemMessages, renderEntryPage } from './interface-registry-lib.mjs'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(web, '../..')
const source = join(repo, 'registry/interfaces')
const pages = join(web, 'src/content/docs/interfaces')
const data = join(web, 'src/generated/interfaces.json')

const files = readdirSync(source, { withFileTypes: true })
	.filter((file) => file.isFile() && file.name.endsWith('.md'))
	.map((file) => file.name)
	.sort()

const failures = []
const entries = []
for (const file of files) {
	const fileId = file.replace(/\.md$/, '')
	const { entry, problems } = parseInterfaceEntry(readFileSync(join(source, file), 'utf8'), fileId)
	if (problems.length > 0 || !entry) {
		failures.push(...problemMessages(`registry/interfaces/${file}`, problems))
		continue
	}
	entries.push(entry)
}

const linkFailures = await Promise.all(
	entries.map((entry) => checkEntryLinks(entry, interfaceEntryLinks(entry), { repo })),
)
failures.push(...linkFailures.flat())

if (failures.length > 0) {
	console.error(`Interface registry check failed:\n${failures.map((failure) => `  ${failure}`).join('\n')}`)
	process.exit(1)
}

rmSync(pages, { recursive: true, force: true })
mkdirSync(pages, { recursive: true })
for (const entry of entries) writeFileSync(join(pages, `${pageSlug(entry.id)}.md`), renderEntryPage(entry))
mkdirSync(dirname(data), { recursive: true })
writeFileSync(data, `${JSON.stringify(entries.map(listRow), null, '\t')}\n`)
