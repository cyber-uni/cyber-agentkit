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

/** What one discovery found below a root: the folders to read, the ones git ignores, and the files git lists. */
export type ProjectFolders = {
	/** The folders whose `.agents/references/` git does not ignore, in path order. */
	folders: ProjectFolder[]
	/**
	 * The folders whose `.agents/references/` git ignores, in path order: one an ignore file names, or
	 * one whose every listed file is ignored. A folder inside an ignored folder is not looked for, so
	 * discovery never walks an ignored tree such as `node_modules/`.
	 */
	ignored: ProjectFolder[]
	/** Each file below the root git lists and does not ignore, relative with `/`; `undefined` outside git, where nothing is ignored. */
	listed?: ReadonlySet<string> | undefined
}

/** One discovery per root, so one run asks git once per root. */
export type ProjectFolderCache = Map<string, ProjectFolders>

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

type GitListing = { files: string[]; ignored: string[] }

/**
 * Every file below `root` git tracks or would track and no ignore file git reads ignores, tracked
 * or not: `git ls-files -co --exclude-standard`, less what `-coi --directory` names as ignored, which
 * lists an ignored folder git does not track as the folder alone. `undefined` when git cannot list
 * the folder.
 */
function gitListing(root: string): GitListing | undefined {
	try {
		const ignored = lsFiles(root, '-coi', '--directory')
		const skip = new Set(ignored)
		return { files: lsFiles(root, '-co').filter((file) => !skip.has(file)), ignored }
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

/**
 * The project folder an ignored entry stands for: a file's folder, as `folderOf` reads it, or a folder
 * git names whole (`build/`) when it holds a `.agents/references/` of its own.
 */
function ignoredFolderOf(root: string, entry: string): string | undefined {
	if (!entry.endsWith('/')) return folderOf(entry)
	const segments = entry.slice(0, -1).split('/')
	if (segments.at(-1) === referencesPath[1] && segments.at(-2) === referencesPath[0]) segments.splice(-2)
	else if (segments.at(-1) === referencesPath[0]) segments.splice(-1)
	const folder = segments.join('/')
	return folder && isDirectory(join(root, ...segments, ...referencesPath)) ? folder : undefined
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

function located(top: string, folders: Iterable<string>): ProjectFolder[] {
	return [...folders]
		.sort(comparePaths)
		.map((folder) => ({ folder, dir: join(top, ...folder.split('/'), ...referencesPath) }))
		.filter(({ dir }) => isDirectory(dir))
}

function discover(top: string): ProjectFolders {
	const listing = gitListing(top)
	if (listing === undefined) return { folders: located(top, walk(top)), ignored: [] }
	const read = new Set(listing.files.flatMap((file) => folderOf(file) ?? []))
	const ignored = new Set(
		listing.ignored.flatMap((entry) => {
			const folder = ignoredFolderOf(top, entry)
			return folder === undefined || read.has(folder) ? [] : [folder]
		}),
	)
	return { folders: located(top, read), ignored: located(top, ignored), listed: new Set(listing.files) }
}

/**
 * The folders strictly below `root` holding a `.agents/references/`, the ones git ignores apart, and
 * the files git lists. In a git repository, git lists them once per root and `cache` keeps the answer
 * for the run; outside one, the tree is walked and nothing is ignored. Folder data only: what the
 * folders hold is read elsewhere.
 */
export function projectFolders(root: string, cache: ProjectFolderCache = new Map()): ProjectFolders {
	const top = resolve(root)
	const known = cache.get(top)
	if (known) return known
	const found = discover(top)
	cache.set(top, found)
	return found
}

/**
 * The folders strictly below `root` holding a `.agents/references/`, in path order. In a git
 * repository, git lists them once per root and `cache` keeps the list for the run; a folder any ignore
 * file git reads ignores is left out. Outside one, the tree is walked and none is ignored.
 */
export function projectReferenceFolders(root: string, cache: ProjectFolderCache = new Map()): ProjectFolder[] {
	return projectFolders(root, cache).folders
}

/**
 * Whether git ignores `path` below `root`, by any ignore file git reads: `git check-ignore`. Outside
 * a git repository, or where git cannot answer, nothing is ignored, as discovery has it.
 */
export function gitIgnores(root: string, path: string): boolean {
	try {
		execFileSync('git', ['check-ignore', '-q', '--', path], { cwd: root, stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}
