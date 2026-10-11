import { lstat } from 'node:fs/promises'
import { sep } from 'node:path'

import { readDirty } from './dirty.js'
import { type Exec, nodeExec } from './exec.js'
import { defaultBranchRef, type ForgeMergedProbe } from './landed.js'
import { claimLease, holdsLease, type Lease, type LeaseFs, release } from './lease.js'
import { listWorktrees, normalizeWorktreePath, primaryRoot, type WorktreeEntry } from './list-worktrees.js'
import { slotNumber, slotPath } from './naming.js'
import { type LeftoverProcess, type ProcessProbe, probeProcesses, type WorktreeOccupancy } from './occupancy.js'
import { classifyOwner, parseLeaseReason, type WorktreeOwner } from './owner.js'

/**
 * Why a worktree cannot be reused, in the order the checks run (E-TH-2). The first that applies wins.
 *
 * - `primary`: the primary checkout, never reused.
 * - `foreign`: another tool or the user owns it; see `owner`.
 * - `leased`: a holder has it; see `holder`. The lease protects it whatever the probe sees.
 * - `prunable`: its checkout is gone from disk.
 * - `busy`: a live agent session works inside.
 * - `unverified`: the probe could not read processes and the caller asked for `strict`.
 * - `dirty`: uncommitted changes, or git could not say (fail closed).
 * - `unmerged`: HEAD has not landed on the reset target, or that could not be told.
 * - `rejected`: the caller's `available` predicate said no.
 */
export type SkipReason =
	| 'primary'
	| 'foreign'
	| 'leased'
	| 'prunable'
	| 'busy'
	| 'unverified'
	| 'dirty'
	| 'unmerged'
	| 'rejected'

/** One worktree's standing for reuse. */
export interface WorktreeVerdict {
	worktree: WorktreeEntry
	owner: WorktreeOwner
	/** Absent when the worktree can be reused. */
	skip?: SkipReason | undefined
	/** The lease holder, when `skip` is `leased`. */
	holder?: string | undefined
	/** What the probe saw, when the checks reached it. */
	occupancy?: WorktreeOccupancy | undefined
	/**
	 * `false` when the probe could not read processes, so a reusable verdict is not proof that no
	 * session works there. `true` when the probe answered or was never needed.
	 */
	verified: boolean
}

export interface ExplainOptions {
	/** Any directory inside the repository; ignored when `primaryRoot` is given. Defaults to `.`. */
	from?: string | undefined
	/** The primary checkout's root; resolved from `from` when absent. */
	primaryRoot?: string | undefined
	/** The ref a recycle resets to. Defaults to `origin/HEAD`, then the primary checkout's branch. */
	base?: string | undefined
	exec?: Exec | undefined
	/** Paths whose changes do not make a worktree dirty; see `DirtyOptions.ignore`. */
	ignore?: readonly string[] | undefined
	/** The opt-in forge signal for "landed"; see `ListWorktreesOptions.forge`. */
	forge?: ForgeMergedProbe | undefined
	/** A process snapshot; one is taken when absent. */
	probe?: ProcessProbe | undefined
	/** Treat a probe that could not read processes as busy. Off by default: reuse proceeds, unverified. */
	strict?: boolean | undefined
	/** `$CODEX_HOME`, so Codex worktrees classify as `codex`; see `ClassifyOwnerOptions`. */
	codexHome?: string | undefined
	/** An extra condition, checked after every safety check; it cannot make a skipped worktree reusable. */
	available?: ((worktree: WorktreeEntry) => boolean | Promise<boolean>) | undefined
}

interface Survey {
	primary: string
	exec: Exec
	/** The reset target, unresolved when the repo has no default branch to fall back on. */
	base: string | undefined
	entries: WorktreeEntry[]
	verdicts: WorktreeVerdict[]
}

/** Every worktree of the repo with the reason it cannot be reused, or none when it can. */
export async function explain(options: ExplainOptions = {}): Promise<WorktreeVerdict[]> {
	return (await survey(options)).verdicts
}

async function survey(options: ExplainOptions): Promise<Survey> {
	const exec = options.exec ?? nodeExec
	const primary = await normalizeWorktreePath(options.primaryRoot ?? (await primaryRoot({ from: options.from, exec })))
	const entries = await listWorktrees({ primaryRoot: primary, exec, ignore: options.ignore, forge: options.forge })
	const base = options.base ?? (await defaultBranchRef(exec, primary, entries.find((entry) => !entry.linked)?.branch))
	const codexHome = options.codexHome && (await normalizeWorktreePath(options.codexHome))
	let probe = options.probe
	const verdicts: WorktreeVerdict[] = []
	for (const entry of entries) {
		const owner = classifyOwner(entry, { primaryRoot: primary, codexHome })
		const verdict: WorktreeVerdict = { worktree: entry, owner, verified: true }
		verdicts.push(verdict)
		if (!entry.linked) {
			verdict.skip = 'primary'
			continue
		}
		if (owner.owner !== 'self') {
			verdict.skip = 'foreign'
			continue
		}
		const lease = parseLeaseReason(entry.locked)
		if (lease) {
			verdict.skip = 'leased'
			verdict.holder = lease.holder
			continue
		}
		if (entry.prunable) {
			verdict.skip = 'prunable'
			continue
		}
		probe ??= await probeProcesses()
		const nested = entries
			.map((other) => other.root)
			.filter((root) => root !== entry.root && root.startsWith(entry.root + sep))
		const occupancy = probe.occupancy(entry.root, { strict: options.strict, nested })
		verdict.occupancy = occupancy
		verdict.verified = occupancy.verified
		if (occupancy.busy) {
			verdict.skip = occupancy.verified ? 'busy' : 'unverified'
			continue
		}
		if (entry.dirty !== false) {
			verdict.skip = 'dirty'
			continue
		}
		if (!(await hasLanded(exec, primary, entry, base))) {
			verdict.skip = 'unmerged'
			continue
		}
		if (options.available && !(await options.available(entry))) verdict.skip = 'rejected'
	}
	return { primary, exec, base, entries, verdicts }
}

/** The branch has landed on the default branch, or HEAD (detached after a recycle) is in `base`. */
async function hasLanded(exec: Exec, primary: string, entry: WorktreeEntry, base: string | undefined) {
	if (entry.merged === true) return true
	if (!entry.head || !base) return false
	return (await exec('git', ['-C', primary, 'merge-base', '--is-ancestor', entry.head, base])) !== null
}

/** What a `WorktreeCreator` is asked to make. */
export interface CreateWorktreeRequest {
	primaryRoot: string
	/** The library-chosen path, `<parent>/<repo>.worktrees/<repo>-<n>`; the creator must use it. */
	path: string
	/** The ref to start from. */
	base: string
	/** The branch to check out: an existing one, or a new one at `base`. Detached at `base` when absent. */
	branch?: string | undefined
}

/**
 * Makes the worktree at the library-chosen path, so a caller can create it through another tool,
 * such as herdr, which binds only worktrees it created itself (E-MUX-7). Throw on failure.
 */
export type WorktreeCreator = (request: CreateWorktreeRequest) => Promise<void>

/**
 * Undoes what a `WorktreeCreator` did besides the checkout itself, such as a herdr workspace bound to
 * the path. `acquire` calls it when the slot it just created lost its lease claim: the checkout may
 * now belong to whoever won the claim (E-GIT-L5), so this must leave the worktree and its directory
 * alone. Failures are swallowed so the retry still runs.
 */
export type WorktreeCreatorUndo = (request: CreateWorktreeRequest) => Promise<void>

/** The default `WorktreeCreator`: `git worktree add`. */
export function gitWorktreeCreator(exec: Exec = nodeExec): WorktreeCreator {
	return async ({ primaryRoot, path, base, branch }) => {
		const args = ['-C', primaryRoot, 'worktree', 'add', '--quiet']
		if (!branch) args.push('--detach', path, base)
		else if (await branchExists(exec, primaryRoot, branch)) args.push(path, branch)
		else args.push('-b', branch, path, base)
		if ((await exec('git', args)) === null) throw new Error(`git worktree add failed: ${path}`)
	}
}

export interface AcquireOptions extends ExplainOptions {
	/** Who holds the lease, such as a Captain or Pod; recorded in the lock reason. */
	holder: string
	/** The branch to work on: an existing one, or a new one at `base`. Detached at `base` when absent. */
	branch?: string | undefined
	/** The most slots the repo may have; a new one is created only below it. Unlimited when absent. */
	max?: number | undefined
	/** Defaults to `gitWorktreeCreator(exec)`. */
	create?: WorktreeCreator | undefined
	/** Called when a slot `create` made lost its lease claim; see `WorktreeCreatorUndo`. */
	undoCreate?: WorktreeCreatorUndo | undefined
	/** The lease store's file operations; see `LeaseFs`. */
	fs?: LeaseFs | undefined
	/** Makes lease ids; defaults to a random UUID. */
	newLeaseId?: (() => string) | undefined
}

export interface AcquireResult extends Lease {
	/** `true` when an idle worktree was recycled, `false` when a new one was created. A reused path
	 * carries path-keyed harness state, so a "continue" there resumes the previous task (E-PROC-CC6). */
	reused: boolean
	/** The branch now checked out; absent when detached. */
	branch?: string | undefined
	/** The branch a reused worktree had before the recycle. */
	previousBranch?: string | undefined
	/** That branch was merged and has been deleted. */
	previousBranchDeleted?: boolean | undefined
	/** `false` when the reused worktree was not checked for live sessions because the probe could not
	 * read processes. */
	verified: boolean
	/** Dev services left running in a reused worktree with no live session behind them. Never killed. */
	lingering: LeftoverProcess[]
}

export type AcquireErrorCode = 'pool-full' | 'no-base' | 'contended'

export class AcquireError extends Error {
	constructor(
		readonly code: AcquireErrorCode,
		message: string,
		/** The skip reason for every worktree, from the last look. */
		readonly verdicts: readonly WorktreeVerdict[],
	) {
		super(message)
		this.name = 'AcquireError'
	}
}

const ATTEMPTS = 3

/**
 * Lease a worktree: recycle an idle one of ours when there is one, otherwise create one at the next
 * free slot if under `max`. Never fetches and never kills a process.
 */
export async function acquire(options: AcquireOptions): Promise<AcquireResult> {
	let verdicts: WorktreeVerdict[] = []
	for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
		const found = await survey(options)
		verdicts = found.verdicts
		const { primary, exec, entries } = found
		if (!found.base) throw new AcquireError('no-base', 'no base ref: pass `base` or set origin/HEAD', verdicts)
		const base = await exec('git', ['-C', primary, 'rev-parse', '--verify', '--quiet', `${found.base}^{commit}`])
		if (!base) throw new AcquireError('no-base', `base does not resolve to a commit: ${found.base}`, verdicts)

		const idle = verdicts
			.filter((verdict) => verdict.skip === undefined)
			.sort((a, b) => slotOf(primary, a) - slotOf(primary, b))
		for (const verdict of idle) {
			const result = await recycle(verdict, base, options, exec, primary)
			if (result) return result
		}

		const slots = entries.filter((entry) => entry.linked && slotNumber(primary, entry.root) !== undefined)
		if (options.max !== undefined && slots.length >= options.max)
			throw new AcquireError('pool-full', `all ${options.max} worktrees are in use`, verdicts)
		const lease = await createSlot(primary, base, options, exec, slots)
		if (lease) return { ...lease, reused: false, branch: options.branch, verified: true, lingering: [] }
	}
	throw new AcquireError('contended', 'another caller took every worktree this one tried', verdicts)
}

function slotOf(primary: string, verdict: WorktreeVerdict) {
	return slotNumber(primary, verdict.worktree.root) ?? Number.POSITIVE_INFINITY
}

async function recycle(
	verdict: WorktreeVerdict,
	base: string,
	options: AcquireOptions,
	exec: Exec,
	primary: string,
): Promise<AcquireResult | undefined> {
	const entry = verdict.worktree
	const store = { exec, fs: options.fs }
	const lease = await claimLease(entry.root, options.holder, { ...store, leaseId: options.newLeaseId?.() })
	if (!lease) return undefined
	// Re-check after the claim (E-TH-2): the tree may have changed since the survey.
	const head = await exec('git', ['-C', entry.root, 'rev-parse', 'HEAD'])
	const dirty = await readDirty(entry.root, { exec, ignore: options.ignore })
	if (head !== entry.head || dirty !== false || !(await holdsLease(lease, store))) {
		await release(lease, store)
		return undefined
	}
	const git = (...args: string[]) => exec('git', ['-C', entry.root, ...args])
	const fail = async (message: string) => {
		await release(lease, store)
		throw new Error(`${message}: ${entry.root}`)
	}
	// No `-x`, so `node_modules` and other ignored installs survive (E-TH-3).
	if ((await git('read-tree', '--reset', '-u', base)) === null || (await git('clean', '-fd')) === null)
		return fail('recycle failed')
	const switched = options.branch
		? (await branchExists(exec, primary, options.branch))
			? await git('switch', '--quiet', '--discard-changes', options.branch)
			: await git('switch', '--quiet', '--discard-changes', '-c', options.branch, base)
		: await git('switch', '--quiet', '--discard-changes', '--detach', base)
	if (switched === null) return fail(`recycle could not switch to ${options.branch ?? base}`)

	const result: AcquireResult = {
		...lease,
		reused: true,
		branch: options.branch,
		verified: verdict.verified,
		lingering: verdict.occupancy?.lingering ?? [],
	}
	const previous = entry.branch
	if (previous) {
		result.previousBranch = previous
		// `-D`: a squash-merged branch is landed (E-MUX-4) but not an ancestor, so `-d` would refuse.
		if (entry.merged === true && previous !== options.branch)
			result.previousBranchDeleted = (await exec('git', ['-C', primary, 'branch', '-D', previous])) !== null
	}
	return result
}

async function createSlot(
	primary: string,
	base: string,
	options: AcquireOptions,
	exec: Exec,
	slots: readonly WorktreeEntry[],
): Promise<Lease | undefined> {
	const used = new Set(slots.map((entry) => slotNumber(primary, entry.root)))
	let n = 1
	while (used.has(n) || (await exists(slotPath(primary, n)))) n++
	const path = slotPath(primary, n)
	const create = options.create ?? gitWorktreeCreator(exec)
	const request = { primaryRoot: primary, path, base, branch: options.branch }
	try {
		await create(request)
	} catch (error) {
		// Another caller took the slot first; the next attempt picks another.
		if (await exists(path)) return undefined
		throw error
	}
	let lease: Lease | undefined
	try {
		lease = await claimLease(await normalizeWorktreePath(path), options.holder, {
			exec,
			fs: options.fs,
			leaseId: options.newLeaseId?.(),
		})
	} catch (error) {
		await undo(options.undoCreate, request)
		throw error
	}
	if (!lease) await undo(options.undoCreate, request)
	return lease
}

async function undo(undoCreate: WorktreeCreatorUndo | undefined, request: CreateWorktreeRequest) {
	try {
		await undoCreate?.(request)
	} catch {
		// Best effort: a failed undo must not turn a retryable loss into a failure.
	}
}

async function branchExists(exec: Exec, primary: string, branch: string) {
	return (await exec('git', ['-C', primary, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) !== null
}

async function exists(path: string) {
	try {
		await lstat(path)
		return true
	} catch {
		return false
	}
}
