import { realpath } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { readDirty } from './dirty.js'
import { type Exec, nodeExec } from './exec.js'
import {
	defaultBranchRef,
	type ForgeMergedProbe,
	type LandedSignal,
	readLandedContext,
	resolveLanded,
} from './landed.js'

/** A worktree as git reports it, plus the landed and dirty facts the reuse and cleanup checks read. */
export interface WorktreeEntry {
	/** Absolute checkout path, symlinks resolved. */
	root: string
	/** The checked-out commit; absent for a bare entry. */
	head?: string | undefined
	/** The checked-out branch, without `refs/heads/`; absent when detached or bare. */
	branch?: string | undefined
	/** HEAD is detached. */
	detached: boolean
	/** `false` for the primary checkout, `true` for a linked worktree. */
	linked: boolean
	/** git considers the entry stale: its checkout is gone from disk. */
	prunable: boolean
	/**
	 * The lock reason when the worktree is locked (`''` for a lock with no reason), absent when it is
	 * not. A lock may be a lease, a harness's own hold, or a user's.
	 */
	locked?: string | undefined
	/**
	 * The branch's work has landed on the default branch. Absent when undeterminable (no branch, or no
	 * default branch to compare against), never `false` as a stand-in.
	 */
	merged?: boolean | undefined
	/** Which signal established `merged: true`. */
	mergedSignal?: LandedSignal | undefined
	/**
	 * The checkout has uncommitted changes, tracked or untracked. Absent for a prunable entry or when
	 * git could not answer.
	 */
	dirty?: boolean | undefined
}

export interface PrimaryRootOptions {
	/** Any directory inside the repository, the primary checkout or a linked worktree. Defaults to `.`. */
	from?: string | undefined
	exec?: Exec | undefined
}

/**
 * The primary checkout's root, from the primary checkout or any linked worktree:
 * `--git-common-dir` always points at the primary's `.git`.
 */
export async function primaryRoot(options: PrimaryRootOptions = {}): Promise<string> {
	const exec = options.exec ?? nodeExec
	const commonDir = await exec('git', [
		'-C',
		options.from ?? '.',
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	])
	if (!commonDir) throw new Error(`not inside a git repository: ${resolve(options.from ?? '.')}`)
	return dirname(commonDir)
}

/**
 * The single normalization for every path matched against another, so a symlinked repo or macOS's
 * `/tmp` → `/private/tmp` still matches. Falls back to `resolve` for a path not on disk.
 */
export async function normalizeWorktreePath(path: string): Promise<string> {
	try {
		return await realpath(path)
	} catch {
		return resolve(path)
	}
}

export interface ListWorktreesOptions {
	/** The primary checkout's root; see `primaryRoot`. */
	primaryRoot: string
	exec?: Exec | undefined
	/** Paths whose changes do not make a worktree dirty; see `DirtyOptions.ignore`. */
	ignore?: readonly string[] | undefined
	/** The opt-in forge signal; the offline signals run either way. */
	forge?: ForgeMergedProbe | undefined
}

/** Every worktree of the repo, from `git worktree list --porcelain`, with landed and dirty facts. */
export async function listWorktrees(options: ListWorktreesOptions): Promise<WorktreeEntry[]> {
	const exec = options.exec ?? nodeExec
	const out = await exec('git', ['-C', options.primaryRoot, 'worktree', 'list', '--porcelain'])
	if (!out) return []
	const primary = await normalizeWorktreePath(options.primaryRoot)
	const entries = await Promise.all(
		out
			.split('\n\n')
			.map((record) => record.trim())
			.filter((record) => record.startsWith('worktree '))
			.map((record) => parseRecord(record, primary)),
	)
	const target = await defaultBranchRef(exec, options.primaryRoot, entries.find((entry) => !entry.linked)?.branch)
	const context = await readLandedContext(exec, options.primaryRoot, target, options.forge)
	for (const entry of entries) {
		const landed = await resolveLanded(entry.branch, context)
		if (landed.merged !== undefined) entry.merged = landed.merged
		if (landed.signal !== undefined) entry.mergedSignal = landed.signal
		if (!entry.prunable) {
			const dirty = await readDirty(entry.root, { exec, ignore: options.ignore })
			if (dirty !== undefined) entry.dirty = dirty
		}
	}
	return entries
}

async function parseRecord(record: string, primary: string): Promise<WorktreeEntry> {
	const lines = record.split('\n')
	const root = await normalizeWorktreePath(unquote(lines[0]!.slice('worktree '.length)))
	const value = (key: string) => {
		const line = lines.find((line) => line === key || line.startsWith(`${key} `))
		return line === undefined ? undefined : unquote(line.slice(key.length + 1))
	}
	const entry: WorktreeEntry = {
		root,
		detached: lines.includes('detached'),
		// From the path, not record order: git lists the primary first today, but that is not promised.
		linked: root !== primary,
		prunable: value('prunable') !== undefined,
	}
	const head = value('HEAD')
	if (head) entry.head = head
	const branch = value('branch')?.replace(/^refs\/heads\//, '')
	if (branch) entry.branch = branch
	const locked = value('locked')
	if (locked !== undefined) entry.locked = locked
	return entry
}

const escapes: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }

/**
 * Undo git's C-style quoting, which porcelain applies to a path or lock reason holding a quote,
 * backslash, or control character: `"a\"b\n"` → `a"b` plus a newline. Octal escapes are bytes, so a
 * quoted UTF-8 name decodes back to its characters.
 */
function unquote(text: string): string {
	if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) return text
	const bytes: number[] = []
	const body = text.slice(1, -1)
	for (let i = 0; i < body.length; i++) {
		const char = body[i]!
		if (char !== '\\') {
			bytes.push(...Buffer.from(char))
			continue
		}
		const next = body[++i] ?? ''
		const octal = /^[0-7]{3}/.exec(body.slice(i))
		if (octal) {
			bytes.push(Number.parseInt(octal[0], 8))
			i += 2
		} else bytes.push(...Buffer.from(escapes[next] ?? next))
	}
	return Buffer.from(bytes).toString('utf8')
}
