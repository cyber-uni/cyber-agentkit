import { randomUUID } from 'node:crypto'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { type Exec, nodeExec } from './exec.js'
import { normalizeWorktreePath } from './list-worktrees.js'
import { LEASE_LIBRARY, type LeaseReason, parseLeaseReason } from './owner.js'

/** A held worktree: what `acquire` hands out and `release` takes back. */
export interface Lease {
	/** The worktree root, as `WorktreeEntry.root` gives it. */
	worktree: string
	leaseId: string
	holder: string
	/**
	 * The repo's git common dir, recorded at claim so `release` can still clear the lock after the
	 * worktree's directory is gone. Absent on a hand-built lease; then the checkout must exist.
	 */
	commonDir?: string | undefined
}

/**
 * The file operations the lease store performs on git's `locked` file, injected so a caller can
 * sandbox them or a test can stage the race with `git worktree lock` (E-GIT-L5). Paths are absolute.
 */
export interface LeaseFs {
	/** Create the file only if nothing is there; `false` when something already is. */
	createExclusive(path: string, text: string): Promise<boolean>
	/** The file's text, or `undefined` when it does not exist. */
	readText(path: string): Promise<string | undefined>
	/** Delete the file; a no-op when it is already gone. */
	remove(path: string): Promise<void>
}

/** The default `LeaseFs`, on `node:fs/promises`. */
export const nodeLeaseFs: LeaseFs = {
	async createExclusive(path, text) {
		try {
			await writeFile(path, text, { flag: 'wx' })
			return true
		} catch (error) {
			if ((error as { code?: string }).code === 'EEXIST') return false
			throw error
		}
	},
	async readText(path) {
		try {
			return await readFile(path, 'utf8')
		} catch (error) {
			if ((error as { code?: string }).code === 'ENOENT') return undefined
			throw error
		}
	},
	async remove(path) {
		try {
			await unlink(path)
		} catch (error) {
			if ((error as { code?: string }).code !== 'ENOENT') throw error
		}
	},
}

export interface LeaseStoreOptions {
	exec?: Exec | undefined
	/** Defaults to `nodeLeaseFs`. */
	fs?: LeaseFs | undefined
}

/**
 * `$GIT_COMMON_DIR/worktrees/<id>/locked` for a linked worktree, or `undefined` when git cannot say.
 * The `<id>` is git's admin folder name, which need not match the basename, so it is read from
 * `--git-dir` rather than built. When the checkout is gone, `commonDir` finds the admin folder by the
 * `gitdir` pointer it keeps, so a lease on a vanished worktree can still be cleared.
 */
export async function leaseFile(
	worktreeRoot: string,
	exec: Exec = nodeExec,
	commonDir?: string | undefined,
): Promise<string | undefined> {
	const gitDir = await exec('git', ['-C', worktreeRoot, 'rev-parse', '--path-format=absolute', '--git-dir'])
	if (gitDir) return join(gitDir, 'locked')
	const admin = commonDir && (await adminDirOf(worktreeRoot, commonDir))
	return admin ? join(admin, 'locked') : undefined
}

/** The `worktrees/<id>` folder whose `gitdir` file points at `<worktreeRoot>/.git`. */
async function adminDirOf(worktreeRoot: string, commonDir: string): Promise<string | undefined> {
	const dir = join(commonDir, 'worktrees')
	const target = await dotGitOf(worktreeRoot)
	let ids: string[]
	try {
		ids = await readdir(dir)
	} catch {
		return undefined
	}
	for (const id of ids) {
		let pointer: string
		try {
			pointer = (await readFile(join(dir, id, 'gitdir'), 'utf8')).trim()
		} catch {
			continue
		}
		if ((await dotGitOf(dirname(pointer))) === target) return join(dir, id)
	}
	return undefined
}

/** `<root>/.git` with the root's existing ancestors resolved, so a vanished root still compares. */
async function dotGitOf(root: string) {
	return join(await normalizeWorktreePath(dirname(root)), basename(root), '.git')
}

/**
 * Claim a worktree: exclusive-create its `locked` file with the lease as a one-line JSON reason, which
 * git then honours as a lock (E-GIT-L1, E-GIT-L2, E-GIT-L3), and read it back. `git worktree lock`
 * checks then truncates, so it can overwrite a lease created inside its window (E-GIT-L5); the read
 * back catches that. `undefined` when the worktree is already locked or the claim was lost.
 */
export async function claimLease(
	worktreeRoot: string,
	holder: string,
	options: LeaseStoreOptions & { leaseId?: string | undefined } = {},
): Promise<Lease | undefined> {
	const exec = options.exec ?? nodeExec
	const fs = options.fs ?? nodeLeaseFs
	const path = await leaseFile(worktreeRoot, exec)
	if (!path) return undefined
	const commonDir = await exec('git', ['-C', worktreeRoot, 'rev-parse', '--path-format=absolute', '--git-common-dir'])
	const lease: Lease = {
		worktree: worktreeRoot,
		leaseId: options.leaseId ?? randomUUID(),
		holder,
		commonDir: commonDir ?? undefined,
	}
	const reason: LeaseReason = { library: LEASE_LIBRARY, leaseId: lease.leaseId, holder }
	if (!(await fs.createExclusive(path, JSON.stringify(reason)))) return undefined
	return (await holdsLease(lease, { exec, fs })) ? lease : undefined
}

/** Whether the worktree's `locked` file still records this lease. Checked again before a destructive
 * step, since a manual `git worktree unlock` or a racing `lock` can take it away (E-GIT-L4, E-GIT-L5). */
export async function holdsLease(lease: Lease, options: LeaseStoreOptions = {}): Promise<boolean> {
	const path = await leaseFile(lease.worktree, options.exec ?? nodeExec, lease.commonDir)
	if (!path) return false
	const text = await (options.fs ?? nodeLeaseFs).readText(path)
	return parseLeaseReason(text)?.leaseId === lease.leaseId
}

export type ReleaseResult =
	| { released: true }
	/** The `locked` file no longer records this lease: someone unlocked it, broke it with
	 * `remove -f -f` (E-GIT-L4), or locked over it. Reported, not thrown: that is the user's override. */
	| { released: false; reason: 'lost' }

/**
 * Give a lease back by deleting the `locked` file, only when it still records this `leaseId`. It does
 * not recycle: an occupant such as a judge may still be working there, so the next `acquire` recycles
 * after probing.
 */
export async function release(lease: Lease, options: LeaseStoreOptions = {}): Promise<ReleaseResult> {
	const exec = options.exec ?? nodeExec
	const fs = options.fs ?? nodeLeaseFs
	const path = await leaseFile(lease.worktree, exec, lease.commonDir)
	if (!path || parseLeaseReason(await fs.readText(path))?.leaseId !== lease.leaseId)
		return { released: false, reason: 'lost' }
	await fs.remove(path)
	return { released: true }
}
