import { sep } from 'node:path'

import type { WorktreeEntry } from './list-worktrees.js'
import { slotNumber } from './naming.js'

/**
 * Who a worktree belongs to. Only `self`, a worktree this library leased, may be reused or removed;
 * every other owner is foreign and left alone.
 *
 * - `self`: locked with this library's lease, or an idle slot the library created: unlocked, at a
 *   library-assigned path (`slotPath`). A lease is a lock that release deletes (E-GIT-L1), so the
 *   slot path is what still marks a released worktree as ours.
 * - `claude-code`, `codex`: recognised by a researched marker.
 * - `cursor`: not produced yet. Its worktree root rests on a forum post only (E-CUR-W1, Low), so a
 *   Cursor worktree reports `unknown` until that is verified.
 * - `user`: the primary checkout.
 * - `unknown`: anything else, including Copilot CLI and herdr worktrees, whose layouts are not
 *   documented (E-COP-W1, E-HERDR-W1), and a lock whose reason names no one we recognise.
 */
export type WorktreeOwnerKind = 'self' | 'claude-code' | 'cursor' | 'codex' | 'user' | 'unknown'

export interface WorktreeOwner {
	owner: WorktreeOwnerKind
	/** The `.research/worktree-management` evidence IDs the classification rests on; empty when none. */
	research: readonly string[]
}

/** The `library` value a lease reason carries. */
export const LEASE_LIBRARY = '@cyberuni/agent-harness'

/** A lease as recorded in the `locked` file: one line of JSON (E-GIT-L1, E-GIT-L2). */
export interface LeaseReason {
	library: typeof LEASE_LIBRARY
	leaseId: string
	holder: string
}

/** The lease a lock reason records, or `undefined` when the lock is not this library's. */
export function parseLeaseReason(reason: string | undefined): LeaseReason | undefined {
	if (!reason) return undefined
	let value: unknown
	try {
		value = JSON.parse(reason)
	} catch {
		return undefined
	}
	if (typeof value !== 'object' || value === null) return undefined
	const { library, leaseId, holder } = value as Record<string, unknown>
	if (library !== LEASE_LIBRARY || typeof leaseId !== 'string' || typeof holder !== 'string') return undefined
	return { library, leaseId, holder }
}

export interface ClassifyOwnerOptions {
	/** The primary checkout's root, normalized as `WorktreeEntry.root` is (`normalizeWorktreePath`). */
	primaryRoot: string
	/**
	 * Codex's home (`$CODEX_HOME`), normalized. Without it no worktree is recognised as Codex's: the
	 * research records the `$CODEX_HOME/worktrees` root but not its default.
	 */
	codexHome?: string | undefined
}

/** Classify a worktree's owner from its lock reason and path. Pure: reads nothing from disk. */
export function classifyOwner(entry: WorktreeEntry, options: ClassifyOwnerOptions): WorktreeOwner {
	// Our lease is the exclusive-created `locked` file with a JSON reason (E-GIT-L1), which porcelain
	// prints C-quoted and `listWorktrees` unquotes (E-GIT-L2).
	if (parseLeaseReason(entry.locked)) return { owner: 'self', research: ['E-GIT-L1', 'E-GIT-L2'] }
	// Claude Code locks a worktree it runs in (E-CC-W4) with this reason (E-PROC-CC5). Checked before
	// the path, since a `WorktreeCreate` hook may place the worktree anywhere (E-CC-W5).
	if (entry.locked?.startsWith('claude session ')) return { owner: 'claude-code', research: ['E-CC-W4', 'E-PROC-CC5'] }
	if (!entry.linked) return { owner: 'user', research: [] }
	// Any other lock is someone's hold, even on one of our slots; only an unlocked slot is idle.
	if (entry.locked === undefined && slotNumber(options.primaryRoot, entry.root) !== undefined)
		return { owner: 'self', research: [] }
	if (isInside(entry.root, `${options.primaryRoot}${sep}.claude${sep}worktrees`))
		return { owner: 'claude-code', research: ['E-CC-W1'] }
	if (options.codexHome && isInside(entry.root, `${options.codexHome}${sep}worktrees`))
		return { owner: 'codex', research: ['E-CODEX-W1'] }
	return { owner: 'unknown', research: [] }
}

function isInside(path: string, dir: string) {
	return path.startsWith(`${dir}${sep}`)
}
