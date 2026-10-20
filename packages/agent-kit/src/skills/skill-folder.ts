import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse } from 'yaml'
import { isRecord } from '../plugins/json-file.js'

const frontmatter = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

/**
 * The `name` in a skill folder's `SKILL.md`, else the folder's own name; `undefined` when the folder
 * holds no `SKILL.md`. A package manager may link a skill under another folder name, such as pnpm's
 * `pnpm-<package>-<skill>` (E-PM-PNPM-4), so the folder name is only a fallback.
 */
export function skillName(folder: string): string | undefined {
	let raw: string
	try {
		raw = readFileSync(join(folder, 'SKILL.md'), 'utf8')
	} catch {
		return undefined
	}
	const match = frontmatter.exec(raw)
	if (match) {
		try {
			const value: unknown = parse(match[1] as string)
			if (isRecord(value) && typeof value['name'] === 'string' && value['name'].trim()) return value['name'].trim()
		} catch {}
	}
	return basename(folder)
}

export type FoundSkill = {
	/** The `name` its `SKILL.md` gives. */
	name: string
	/** The folder, with symlinks resolved. */
	folder: string
}

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}

/**
 * The skills in each folder: the folder itself when it holds a `SKILL.md`, else each skill directly
 * under it, one level deep. A symlinked skill folder is followed, since pnpm and `npx skills` link
 * skills rather than copy them (E-PM-SK-2, E-PM-SK-7); one real folder reached twice is listed once.
 */
export function skillsIn(folders: readonly string[]): FoundSkill[] {
	const found: FoundSkill[] = []
	const seen = new Set<string>()
	const add = (path: string, name: string) => {
		let real = path
		try {
			real = realpathSync(path)
		} catch {}
		if (seen.has(real)) return
		seen.add(real)
		found.push({ name, folder: real })
	}
	for (const folder of folders) {
		const own = skillName(folder)
		if (own !== undefined) {
			add(folder, own)
			continue
		}
		let entries: string[]
		try {
			entries = readdirSync(folder)
		} catch {
			continue
		}
		for (const entry of entries.sort()) {
			const path = join(folder, entry)
			if (!isDirectory(path)) continue
			const name = skillName(path)
			if (name !== undefined) add(path, name)
		}
	}
	return found
}
