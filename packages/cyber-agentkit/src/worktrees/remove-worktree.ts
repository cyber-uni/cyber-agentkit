import { sep } from 'node:path'

import { type Exec, nodeExec } from './exec.js'
import type { ForgeMergedProbe } from './landed.js'
import { listWorktrees, normalizeWorktreePath } from './list-worktrees.js'
import { probeProcesses } from './occupancy.js'
import { classifyOwner } from './owner.js'
import type { ProcessSource } from './process-source.js'
import { type PruneOutcome, removeEntry, skipReason } from './prune-worktrees.js'

export interface RemoveWorktreeOptions {
	/** The primary checkout's root; see `primaryRoot`. */
	primaryRoot: string
	/** The worktree to remove, by path. Symlinks and trailing separators are normalized. */
	root: string
	/**
	 * Remove it with `git worktree remove --force`. `true` waives foreign, `prunable`, dirty, and unmerged,
	 * but still skips a busy or `unverified` worktree. `'in-use'` waives those two as well, reporting the
	 * occupants and never killing them. Off by default: the same fail-closed checks `pruneWorktrees` runs.
	 * The primary checkout and a leased worktree are never removed, in any mode.
	 */
	force?: boolean | 'in-use' | undefined
	/**
	 * Skip a busy worktree when the process probe cannot read this platform. On by default; `false`
	 * proceeds and marks the outcome `unverified`. Moot under `force: 'in-use'`, which does not consult it.
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
 * Removes one worktree the caller names, the single-target counterpart of `pruneWorktrees`, and
 * reports the same `PruneOutcome` with a skip `reason`. The caller naming it is what a prune lacks, so
 * the landed check can be waived with `force`, and the idle check with `force: 'in-use'`; ownership cannot:
 *
 * | worktree | without `force` | `force: true` | `force: 'in-use'` |
 * | --- | --- | --- | --- |
 * | the primary checkout | `primary` | `primary` | `primary` |
 * | held by this library's lease | `leased`; `release` it first | `leased` | `leased`; the lease is never broken |
 * | foreign (another tool, person, or lock) | `foreign` | removed, unless git refuses a locked one: `failed` | same |
 * | a live agent session inside | `busy` (or `unverified`) | `busy` (or `unverified`) | removed; the sessions are reported, never killed |
 * | checkout already gone | `prunable` | `git worktree remove --force` is tried | same |
 * | dirty or unmerged | the matching reason | removed | removed |
 * | a path that is no worktree of this repository | `unlisted` | `unlisted` | `unlisted` |
 *
 * `--force` is passed once and `-f -f` never: one refuses a locked worktree, so a lease taken after the
 * listing holds (E-GIT-L3, E-GIT-L4). Never kills a process; lingering services are reported so the
 * caller can reclaim them. Always applies: there is no dry run, since the caller named the target.
 */
export async function removeWorktree(options: RemoveWorktreeOptions): Promise<PruneOutcome> {
	const exec = options.exec ?? nodeExec
	const primary = await normalizeWorktreePath(options.primaryRoot)
	const root = await normalizeWorktreePath(options.root)
	const entries = await listWorktrees({
		primaryRoot: options.primaryRoot,
		exec,
		ignore: options.ignore,
		forge: options.forge,
	})
	const entry = entries.find((candidate) => candidate.root === root)
	if (!entry) {
		return { root, owner: 'unknown', status: 'skipped', reason: 'unlisted', occupants: [], lingering: [], unlinked: [] }
	}

	const force = options.force ?? false
	const strict = options.strict ?? true
	const owner = classifyOwner(entry, { primaryRoot: primary, codexHome: options.codexHome }).owner
	const probe = await probeProcesses({ source: options.source })
	const nested = entries.map((other) => other.root).filter((path) => path.startsWith(`${entry.root}${sep}`))
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
	if (!occupancy.verified && !strict && force !== 'in-use') outcome.unverified = true
	const reason = skipReason(entry, owner, occupancy, force)
	if (reason) outcome.reason = reason
	else outcome.status = await removeEntry(exec, primary, entry, options.ignore, force !== false)
	return outcome
}
