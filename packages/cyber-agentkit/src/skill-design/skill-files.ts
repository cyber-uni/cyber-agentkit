import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'
import { isExternal, linkTargets, resolveIn } from './skill-text.js'

/** A skill folder as read from disk: its `SKILL.md` split into front matter and body, and every file under it. */
export type SkillFiles = {
	folder: string
	/** The folder's own name, which the skill's `name` must match. */
	folderName: string
	frontmatter: Record<string, unknown> | undefined
	/** Why the front matter could not be read, when it could not. */
	frontmatterProblem: string | undefined
	body: string
	/** Every file under the folder, relative to it, with `/` separators. */
	files: string[]
}

const skipped = new Set(['node_modules', '.git'])

function listFiles(folder: string, under = ''): string[] {
	const files: string[] = []
	for (const entry of readdirSync(join(folder, under), { withFileTypes: true })) {
		if (skipped.has(entry.name)) continue
		const path = under ? `${under}/${entry.name}` : entry.name
		if (entry.isDirectory()) files.push(...listFiles(folder, path))
		else if (entry.isFile()) files.push(path)
	}
	return files.sort()
}

/** Reads a skill folder, or answers `undefined` when it holds no `SKILL.md`. */
export function readSkill(path: string): SkillFiles | undefined {
	const folder = resolve(path)
	const file = join(folder, 'SKILL.md')
	if (!existsSync(file) || !statSync(file).isFile()) return undefined
	const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
	const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
	let frontmatter: Record<string, unknown> | undefined
	let frontmatterProblem: string | undefined
	if (!match) frontmatterProblem = 'SKILL.md does not start with a `---` front matter block'
	else {
		try {
			const value: unknown = parse(match[1] as string)
			if (value && typeof value === 'object' && !Array.isArray(value)) frontmatter = value as Record<string, unknown>
			else frontmatterProblem = 'the front matter is not a mapping'
		} catch (error) {
			frontmatterProblem = `the front matter is not valid YAML: ${(error as Error).message.split('\n')[0]}`
		}
	}
	return {
		folder,
		folderName: basename(folder),
		frontmatter,
		frontmatterProblem,
		body: match ? raw.slice(match[0].length) : raw,
		files: listFiles(folder),
	}
}

/** A file's text, or `undefined` when it is larger than a megabyte or looks binary. */
export function readText(skill: SkillFiles, file: string): string | undefined {
	const path = join(skill.folder, file)
	if (statSync(path).size > 1_000_000) return undefined
	const text = readFileSync(path, 'utf8')
	return text.includes('\u0000') ? undefined : text
}

/** `path` relative to the skill folder, with `/` separators. */
export function inSkill(skill: SkillFiles, path: string): string {
	return relative(skill.folder, path).split('\\').join('/')
}

/** The body's `## <heading>` section, without its heading line, or `undefined` when there is none. */
export function section(markdown: string, heading: string): string | undefined {
	const lines = markdown.split('\n')
	const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase())
	if (start < 0) return undefined
	const rest = lines.slice(start + 1)
	const end = rest.findIndex((line) => /^#{1,2} /.test(line))
	return (end < 0 ? rest : rest.slice(0, end)).join('\n')
}

/**
 * The files a skill's Criteria live in: `SKILL.md`, then each Markdown file under `references/` its body links, in link
 * order. A router skill keeps each command's criteria at the end of the command file it routes to (#337).
 */
export function criteriaFiles(skill: SkillFiles): string[] {
	const files = ['SKILL.md']
	for (const written of linkTargets(skill.body)) {
		if (isExternal(written)) continue
		const path = written.split('#')[0] as string
		if (!path) continue
		let target: string
		try {
			target = resolveIn('.', decodeURI(path))
		} catch {
			continue
		}
		if (target.startsWith('references/') && target.endsWith('.md') && skill.files.includes(target))
			if (!files.includes(target)) files.push(target)
	}
	return files
}

/** One `## Done when` item: its ID `C<n>`, when it has one, and the file it is in. */
export type CriterionItem = { id: string | undefined; file: string }

/**
 * The `## Done when` items of a Markdown text, or `undefined` when it has no such section. In `SKILL.md`, an item with
 * no ID that links a reference file points to that file's list, and is not an item itself.
 */
function doneWhenItems(markdown: string, file: string): CriterionItem[] | undefined {
	const done = section(markdown, 'Done when')
	if (done === undefined) return undefined
	return done
		.split('\n')
		.filter((line) => /^[-*] /.test(line))
		.map((line) => ({ id: /^[-*] \*\*(C\d+)\.?\*\*/.exec(line)?.[1], file, line }))
		.filter((item) => item.id !== undefined || !(file === 'SKILL.md' && /\]\((?:\.\/)?references\//.test(item.line)))
		.map(({ id }) => ({ id, file }))
}

/**
 * The skill's Criteria, in order: the items under `SKILL.md`'s `## Done when`, then those under the `## Done when` of
 * each reference file its body links (#337). `undefined` when `SKILL.md` has no `## Done when`, the section every skill
 * needs even when it only points to its commands' lists.
 */
export function criteriaItems(skill: SkillFiles): { ids: (string | undefined)[]; items: CriterionItem[] } | undefined {
	const own = doneWhenItems(skill.body, 'SKILL.md')
	if (own === undefined) return undefined
	const items = [...own]
	for (const file of criteriaFiles(skill).slice(1)) {
		const text = readText(skill, file)
		if (text !== undefined) items.push(...(doneWhenItems(text.replace(/\r\n/g, '\n'), file) ?? []))
	}
	return { ids: items.map((item) => item.id), items }
}
