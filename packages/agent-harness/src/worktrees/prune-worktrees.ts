import { sep } from 'node:path'

import { readDirty } from './dirty.js'
import { type Exec, nodeExec } from './exec.js'
import type { ForgeMergedProbe } from './landed.js'
import { listWorktrees, normalizeWorktreePath, type WorktreeEntry } from './list-worktrees.js'
import { type LeftoverProcess, probeProcesses, type Session } from './occupancy.js'
import { classifyOwner, parseLeaseReason, type WorktreeOwnerKind } from './owner.js'
import type { ProcessSource } from './process-source.js'

/**
 * Why a worktree was left in place, in the fail-closed order the checks run (E-MUX-5, E-TH-2):
 *
 * - `primary`: the primary checkout. Never removed, with no override.
 * - `foreign`: owned by another tool or person (`classifyOwner`), including a worktree off this library's slot paths.
 * - `leased`: held by this library's lease. git itself refuses to remove it (E-GIT-L3); `release`
 *   it first.
 * - `prunable`: its checkout is already gone; `git worktree prune` collects the entry.
 * - `busy`: a live agent session works inside.
 * - `unverified`: the process probe could not read this platform, and the caller kept the strict
 *   rule.
 * - `dirty`: uncommitted changes, tracked or untracked.
 * - `dirty-unknown`: git could not say whether it is clean.
 * - `unmerged`: its branch has not landed on the default branch.
 * - `merge-unknown`: whether it landed cannot be told (detached HEAD, or no default branch).
 * - `unlisted`: only `removeWorktree` reports it: the named path is no worktree of this repository.
 */
export type PruneSkipReason =
	| 'primary'
	| 'foreign'
	| 'leased'
	| 'prunable'
	| 'busy'
	| 'unverified'
	| 'dirty'
	| 'dirty-unknown'
	| 'unmerged'
	| 'merge-unknown'
	| 'unlisted'

export interface PruneOutcome {
	root: string
	branch?: string | undefined
	owner: WorktreeOwnerKind
	/**
	 * - `candidate`: passed every check; a dry run stops here.
	 * - `removed`: `git worktree remove` succeeded.
	 * - `failed`: passed every check, but git refused, or the tree changed before removal.
	 * - `skipped`: see `reason`.
	 */
	status: 'candidate' | 'removed' | 'failed' | 'skipped'
	reason?: PruneSkipReason | undefined
	/** The probe could not read this platform, and the caller opted out of the strict rule. */
	unverified?: true | undefined
	/** Live agent sessions found inside. */
	occupants: Session[]
	/** Dev services no live session launched: the caller may reclaim them. Never killed. */
	lingering: LeftoverProcess[]
	/** Processes whose launcher cannot be told. Reported, never killed. */
	unlinked: LeftoverProcess[]
}

export interface PruneReport {
	/** `false` for a dry run. */
	applied: boolean
	/** One outcome per considered worktree, in `git worktree list` order. */
	worktrees: PruneOutcome[]
	/** `git worktree prune` succeeded; absent on a dry run. */
	pruned?: boolean | undefined
}

export interface PruneWorktreesOptions {
	/** The primary checkout's root; see `primaryRoot`. */
	primaryRoot: string
	/** Remove the candidates and run `git worktree prune`. Off by default: a dry run. */
	apply?: boolean | undefined
	/** Consider only these worktree roots; every worktree when absent. */
	roots?: readonly string[] | undefined
	/**
	 * Skip every worktree when the process probe cannot read this platform. On by default, since
	 * removal cannot be undone; `false` proceeds and marks each outcome `unverified`.
	 */
	strict?: boolean | undefined
	exec?: Exec | undefined
	/** Paths whose changes do not make a worktree dirty; see `DirtyOptions.ignore`. */
	ignore?: readonly string[] | undefined
	/** The opt-in forge signal for landed detection. */
	forge?: ForgeMergedProbe | undefined
	/** Where processes come from; defaults to Linux `/proc`. */
	source?: ProcessSource | undefined
	/** Codex's home, normalized; see `ClassifyOwnerOptions.codexHome`. */
	codexHome?: string | undefined
}

/**
 * Removes the worktrees this library owns that nothing needs any more: unleased, idle, clean, and
 * landed. A dry run unless `apply` is set. Never touches the primary checkout, a foreign worktree, a
 * leased one, or a busy one, and never kills a process: lingering services are reported so the caller
 * can reclaim them (E-TH-5 is the counterexample).
 *
 * An unleased worktree carries no record of its owner, since the lease is the only one this library
 * writes; `classifyOwner` recognises it as this library's by its slot path (`slotPath`).
 */
export async function pruneWorktrees(options: PruneWorktreesOptions): Promise<PruneReport> {
	const exec = options.exec ?? nodeExec
	const primary = await normalizeWorktreePath(options.primaryRoot)
	const entries = await listWorktrees({
		primaryRoot: options.primaryRoot,
		exec,
		ignore: options.ignore,
		forge: options.forge,
	})
	const wanted = options.roots && new Set(await Promise.all(options.roots.map(normalizeWorktreePath)))
	const probe = await probeProcesses({ source: options.source })
	const strict = options.strict ?? true
	const apply = options.apply === true

	const worktrees: PruneOutcome[] = []
	for (const entry of entries) {
		if (wanted && !wanted.has(entry.root)) continue
		const owner = classifyOwner(entry, { primaryRoot: primary, codexHome: options.codexHome }).owner
		const nested = entries.map((other) => other.root).filter((root) => root.startsWith(`${entry.root}${sep}`))
		const occupancy = probe.occupancy(entry.root, { strict, nested })
		const outcome: PruneOutcome = {
			root: entry.root,
			owner,
			status: 'skipped',
			occupants: occupancy.occupants,
			lingering: occupancy.lingering,
			unlinked: occupancy.unlinked,
		}
		if (entry.branch) outcome.branch = entry.branch
		if (!occupancy.verified && !strict) outcome.unverified = true
		const reason = skipReason(entry, owner, occupancy)
		if (reason) outcome.reason = reason
		else outcome.status = apply ? await removeEntry(exec, primary, entry, options.ignore) : 'candidate'
		worktrees.push(outcome)
	}

	if (!apply) return { applied: false, worktrees }
	const pruned = (await exec('git', ['-C', primary, 'worktree', 'prune'])) !== null
	return { applied: true, worktrees, pruned }
}

/**
 * The first check a worktree fails, or `undefined` when it may go. `force` is `removeWorktree`'s
 * explicit override. `true` waives every check except `primary`, `leased`, and `busy` or `unverified`;
 * `'in-use'` waives those two as well. Nothing waives `primary` and `leased`.
 */
export function skipReason(
	entry: WorktreeEntry,
	owner: WorktreeOwnerKind,
	occupancy: { busy: boolean; verified: boolean },
	force: boolean | 'in-use' = false,
): PruneSkipReason | undefined {
	if (!entry.linked) return 'primary'
	if (parseLeaseReason(entry.locked)) return 'leased'
	if (force) {
		if (force !== 'in-use' && occupancy.busy) return occupancy.verified ? 'busy' : 'unverified'
		return undefined
	}
	// `self` without our lease is an unlocked slot; any other lock is someone else's hold.
	if (owner !== 'self') return 'foreign'
	if (entry.prunable) return 'prunable'
	if (occupancy.busy) return occupancy.verified ? 'busy' : 'unverified'
	if (entry.dirty === undefined) return 'dirty-unknown'
	if (entry.dirty) return 'dirty'
	if (entry.merged === undefined) return 'merge-unknown'
	if (!entry.merged) return 'unmerged'
	return undefined
}

export async function removeEntry(
	exec: Exec,
	primary: string,
	entry: WorktreeEntry,
	ignore: readonly string[] | undefined,
	forced = false,
): Promise<'removed' | 'failed'> {
	if (forced) {
		// A single `--force` still refuses a locked worktree (E-GIT-L3), so a lease or foreign lock holds.
		const out = await exec('git', ['-C', primary, 'worktree', 'remove', '--force', entry.root])
		return out === null ? 'failed' : 'removed'
	}
	// Re-check right before the destructive step: work may have landed in the tree since the listing.
	if ((await readDirty(entry.root, { exec, ignore })) !== false) return 'failed'
	// Plain `remove` refuses untracked files the ignore list exempted, so only then is `--force`
	// passed, and only once: a single `--force` still refuses a locked worktree, so a lease taken
	// since the listing holds (E-GIT-L3). `-f -f` would break it (E-GIT-L4) and is never passed.
	const force = ignore?.length ? ['--force'] : []
	const out = await exec('git', ['-C', primary, 'worktree', 'remove', ...force, entry.root])
	return out === null ? 'failed' : 'removed'
}
