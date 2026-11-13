import { join, normalize } from 'node:path'

const link = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

/** The folders a skill keeps its files in, whose paths a skill names as plain text. */
const skillFolders = 'references|scripts|assets|evals|agents'

/**
 * A path written as plain text, in prose, inline code, or a code block: `scripts/run.sh`,
 * `./references/fix.md`, or `../docs/guide.md`. A path that a shell variable or a placeholder
 * starts (`$DIR/scripts/x.sh`, `<folder>/scripts/x.sh`) or that holds a placeholder is not one.
 */
const plainPath = /(?<![\w./<>$}~@:-])((?:\.\.?\/)*[\w.-]+(?:\/[\w.-]+)*\.[A-Za-z0-9]+)(?![\w<{*$/-])/g

/** Whether `target` is an absolute path or a URL, which no check here resolves. */
export function isExternal(target: string): boolean {
	return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')
}

/** `target` resolved against the folder `from`, both relative to the skill, with `/` separators. */
export function resolveIn(from: string, target: string): string {
	return normalize(join(from, target)).split('\\').join('/')
}

/** Whether a path relative to the skill folder leaves it. */
export function leavesFolder(path: string): boolean {
	return path === '..' || path.startsWith('../')
}

export function withoutFences(text: string): string {
	return text.replace(/```[\s\S]*?```/g, '')
}

/** The targets of a Markdown text's links outside code fences, as written: `references/a.md#b`, `#c`. */
export function linkTargets(text: string): string[] {
	return [...withoutFences(text).matchAll(link)].map((match) => match[1] as string)
}

/**
 * The paths a Markdown text names as plain text, inside code too, with a Markdown link's target
 * left out. Only a name with a `/` in it counts, so a file name in prose (`SKILL.md`) is not read as a path.
 */
export function plainPaths(text: string): string[] {
	const unlinked = text.replace(link, '](')
	return [...unlinked.matchAll(plainPath)].map((match) => match[1] as string).filter((path) => path.includes('/'))
}

/** Whether a plain-text path names a file in one of the skill's own folders, or one relative to the file (`./`). */
export function inOwnFolder(path: string): boolean {
	return path.startsWith('./') || new RegExp(`^(${skillFolders})/`).test(path)
}

/** The anchors of a Markdown text's headings, as GitHub forms them: lower case, punctuation dropped, spaces as `-`. */
export function headingAnchors(text: string): Set<string> {
	const anchors = new Set<string>()
	const counts = new Map<string, number>()
	for (const match of withoutFences(text).matchAll(/^#{1,6}[ \t]+(.+?)[ \t#]*$/gm)) {
		const slug = (match[1] as string)
			.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
			.toLowerCase()
			.replace(/[^\p{L}\p{N}\s_-]/gu, '')
			.trim()
			.replace(/\s/g, '-')
		const seen = counts.get(slug) ?? 0
		counts.set(slug, seen + 1)
		anchors.add(seen ? `${slug}-${seen}` : slug)
	}
	return anchors
}
