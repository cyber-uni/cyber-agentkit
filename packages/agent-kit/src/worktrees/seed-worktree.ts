import { copyFile, lstat, mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { Exec } from './exec.js'

/**
 * The file operations `seedWorktree` performs, injected so a caller can dry-run, sandbox, or log
 * them. Paths are absolute. Nothing here runs a command: the include file is data, never a script
 * (research: 'E-TH-4').
 */
export interface SeedFs {
	/** The file's text, or `undefined` when it does not exist. */
	readText(path: string): Promise<string | undefined>
	/** Whether anything — file, directory, or link — is at the path. */
	exists(path: string): Promise<boolean>
	/** Create a directory and its parents; a no-op when it exists. */
	mkdirp(path: string): Promise<void>
	copyFile(from: string, to: string): Promise<void>
}

/** The default `SeedFs`, on `node:fs/promises`. */
export const nodeSeedFs: SeedFs = {
	async readText(path) {
		try {
			return await readFile(path, 'utf8')
		} catch (error) {
			if ((error as { code?: string }).code === 'ENOENT') return undefined
			throw error
		}
	},
	async exists(path) {
		try {
			await lstat(path)
			return true
		} catch {
			return false
		}
	},
	async mkdirp(path) {
		await mkdir(path, { recursive: true })
	},
	async copyFile(from, to) {
		await copyFile(from, to)
	},
}

export interface SeedWorktreeOptions {
	exec: Exec
	/** Defaults to `nodeSeedFs`. */
	fs?: SeedFs | undefined
	/**
	 * Replace a file the worktree already has. Off by default: a recycled worktree keeps its ignored
	 * files (a recycle runs `clean -fd` without `-x`, research: 'E-TH-3'), and its own `.env` may have
	 * been edited on purpose.
	 */
	overwrite?: boolean | undefined
}

export type SeedSkipReason =
	/** Matches the include file but is not gitignored, so a checkout already carries it or it is
	 * untracked work that belongs to the source checkout (research: 'E-CC-W2'). */
	| 'not-ignored'
	/** The worktree already has something at that path, and `overwrite` is off. */
	| 'exists'
	/** The copy threw; `error` holds the message. */
	| 'failed'

export interface SeedSkip {
	/** Relative to the checkout root, with `/` separators, as git prints it. */
	path: string
	reason: SeedSkipReason
	error?: string | undefined
}

export interface SeedInventory {
	/**
	 * `absent` when the source has no `.worktreeinclude`, so nothing was attempted; `unknown` when git
	 * could not list the candidates, so nothing was copied and nothing is known to be missing.
	 */
	include: 'present' | 'absent' | 'unknown'
	/** Paths copied, relative to the checkout root. */
	copied: string[]
	skipped: SeedSkip[]
}

/** The include file's name and place: the project root, `.gitignore` syntax (research: 'E-CC-W2'). */
export const WORKTREE_INCLUDE = '.worktreeinclude'

/** Pathspecs per `git ls-files` call, to stay under the platform's argument-length limit. */
const CHUNK = 500

/**
 * Copies the gitignored files a `.worktreeinclude` names from a source checkout (normally the primary)
 * into a new or recycled worktree, and reports what it copied and what it skipped.
 *
 * Claude Code's semantics (research: 'E-CC-W2'): the file sits at the project root and uses
 * `.gitignore` syntax, and only a file that matches a pattern *and* is gitignored is copied, so
 * tracked files are never duplicated. Git does the matching here, so negation, anchoring, and
 * directory patterns behave exactly as they do in `.gitignore`. Inside a wholly ignored directory, a
 * pattern that starts with `**` and a slash matches every file below it here, while Claude Code reaches
 * in only when the directory's path holds the pattern's first name (research: 'E-CC-W6'), so this can
 * copy a superset of what Claude Code would.
 *
 * The include file is read from the source's working tree, as Claude Code does, not from its
 * committed HEAD as Treehouse does (research: 'E-TH-4'), so an uncommitted edit takes effect.
 */
export async function seedWorktree(
	sourceRoot: string,
	worktreeRoot: string,
	options: SeedWorktreeOptions,
): Promise<SeedInventory> {
	const fs = options.fs ?? nodeSeedFs
	const inventory: SeedInventory = { include: 'absent', copied: [], skipped: [] }

	const text = await fs.readText(join(sourceRoot, WORKTREE_INCLUDE))
	if (text === undefined) return inventory
	const patterns = parsePatterns(text)
	if (patterns.length === 0) return { ...inventory, include: 'present' }

	// Untracked files matching the include patterns, then which of those git ignores.
	const candidates = await lsFiles(
		options.exec,
		sourceRoot,
		patterns.flatMap((pattern) => ['-x', pattern]),
	)
	if (candidates === undefined) return { ...inventory, include: 'unknown' }
	const ignored = new Set<string>()
	for (let i = 0; i < candidates.length; i += CHUNK) {
		const chunk = candidates.slice(i, i + CHUNK).map((path) => `:(literal)${path}`)
		const found = await lsFiles(options.exec, sourceRoot, ['--exclude-standard', '--', ...chunk])
		if (found === undefined) return { ...inventory, include: 'unknown' }
		for (const path of found) ignored.add(path)
	}

	inventory.include = 'present'
	for (const path of candidates) {
		if (!ignored.has(path)) {
			inventory.skipped.push({ path, reason: 'not-ignored' })
			continue
		}
		const to = join(worktreeRoot, path)
		if (!options.overwrite && (await fs.exists(to))) {
			inventory.skipped.push({ path, reason: 'exists' })
			continue
		}
		try {
			await fs.mkdirp(dirname(to))
			await fs.copyFile(join(sourceRoot, path), to)
			inventory.copied.push(path)
		} catch (error) {
			inventory.skipped.push({ path, reason: 'failed', error: error instanceof Error ? error.message : String(error) })
		}
	}
	return inventory
}

/** Lines of a `.gitignore`-syntax file that carry a pattern; git itself ignores blanks and comments. */
function parsePatterns(text: string) {
	return text.split(/\r?\n/).filter((line) => line.trim() !== '' && !line.startsWith('#'))
}

/** `git ls-files --others --ignored` with the given exclude source, NUL-separated so no path is
 * C-quoted; `undefined` when git failed. */
async function lsFiles(exec: Exec, root: string, args: readonly string[]) {
	const out = await exec('git', ['-C', root, 'ls-files', '-z', '--others', '--ignored', ...args])
	if (out === null) return undefined
	return out.split('\0').filter((path) => path !== '')
}
