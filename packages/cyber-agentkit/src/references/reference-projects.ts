import { execFileSync } from 'node:child_process'
import { type Dirent, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isDirectory } from './reference-layers.js'

/** A folder strictly below the root holding a `.agents/references/`, whose files are that folder's project sections. */
export type ProjectFolder = {
	/** The folder, relative to the root, with `/` between segments. */
	folder: string
	/** Its `.agents/references/` folder, absolute. */
	dir: string
}

/**
 * The files git lists below each root, so one run asks git once per root. A root git does not list
 * (outside a repository, or with no git) maps to `undefined`.
 */
export type ProjectFolderCache = Map<string, readonly string[] | undefined>

const referencesPath = ['.agents', 'references'] as const

function lsFiles(root: string, ...args: string[]): string[] {
	const output = execFileSync('git', ['ls-files', '-z', ...args, '--exclude-standard'], {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
		maxBuffer: 256 * 1024 * 1024,
	})
	return output.split('\0').filter(Boolean)
}

/**
 * Every file below `root` git tracks or would track and no ignore file git reads ignores, tracked
 * or not: `git ls-files -co --exclude-standard`, less the tracked files `-ci` names as ignored.
 * `undefined` when git cannot list the folder.
 */
function gitFiles(root: string): string[] | undefined {
	try {
		const ignored = new Set(lsFiles(root, '-ci'))
		return lsFiles(root, '-co').filter((file) => !ignored.has(file))
	} catch {
		return undefined
	}
}

/** The project folder a listed file sits in: the path before its first `.agents/references/`, when there is one. */
function folderOf(file: string): string | undefined {
	const segments = file.split('/')
	for (let at = 1; at + referencesPath.length < segments.length; at++) {
		if (segments[at] === referencesPath[0] && segments[at + 1] === referencesPath[1]) {
			return segments.slice(0, at).join('/')
		}
	}
	return undefined
}

function entries(dir: string): Dirent[] {
	try {
		return readdirSync(dir, { withFileTypes: true })
	} catch {
		return []
	}
}

/**
 * Outside git, nothing is ignored: walk every folder below `root`, never following a symlink, and
 * keep each one whose `.agents/references/` holds something. A `.agents/references/` folder is not
 * walked into, since what it holds are documents.
 */
function walk(root: string): string[] {
	const found: string[] = []
	const visit = (relative: string) => {
		for (const entry of entries(join(root, relative))) {
			if (!entry.isDirectory()) continue
			const child = relative ? `${relative}/${entry.name}` : entry.name
			if (entry.name !== referencesPath[0]) {
				visit(child)
				continue
			}
			if (relative && entries(join(root, child, referencesPath[1])).length) found.push(relative)
			for (const inner of entries(join(root, child))) {
				if (inner.isDirectory() && inner.name !== referencesPath[1]) visit(`${child}/${inner.name}`)
			}
		}
	}
	visit('')
	return found
}

/** Segment by segment by character code, so a folder precedes the folders inside it. */
export function comparePaths(a: string, b: string): number {
	const left = a.split('/')
	const right = b.split('/')
	for (let at = 0; at < Math.min(left.length, right.length); at++) {
		const x = left[at] as string
		const y = right[at] as string
		if (x !== y) return x < y ? -1 : 1
	}
	return left.length - right.length
}

/**
 * The folders strictly below `root` holding a `.agents/references/`, in path order. In a git
 * repository, git lists them once per root and `cache` keeps the list for the run; a folder any ignore
 * file git reads ignores is left out. Outside one, the tree is walked and none is ignored. Folder data
 * only: what the folders hold is read elsewhere.
 */
export function projectReferenceFolders(root: string, cache: ProjectFolderCache = new Map()): ProjectFolder[] {
	const top = resolve(root)
	if (!cache.has(top)) cache.set(top, gitFiles(top))
	const listed = cache.get(top)
	const folders = listed === undefined ? walk(top) : [...new Set(listed.flatMap((file) => folderOf(file) ?? []))]
	return folders
		.sort(comparePaths)
		.map((folder) => ({ folder, dir: join(top, ...folder.split('/'), ...referencesPath) }))
		.filter(({ dir }) => isDirectory(dir))
}
