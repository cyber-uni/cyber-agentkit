import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { parse } from 'yaml'

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

/** The IDs `C<n>` of the skill's Criteria, in order, as listed under `## Done when`; `undefined` with no such section. */
export function criteriaItems(skill: SkillFiles): { ids: (string | undefined)[] } | undefined {
	const done = section(skill.body, 'Done when')
	if (done === undefined) return undefined
	const items = done.split('\n').filter((line) => /^[-*] /.test(line))
	return { ids: items.map((line) => /^[-*] \*\*(C\d+)\.?\*\*/.exec(line)?.[1]) }
}
