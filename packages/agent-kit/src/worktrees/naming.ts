import { basename, dirname, join } from 'node:path'

/**
 * Where the library puts a repo's worktrees: `<parent>/<repo>.worktrees`, a sibling of the primary
 * checkout (E-MUX-2, E-LEG-1). Every worktree the library creates is a slot in this folder.
 */
export function worktreesDir(primaryRoot: string): string {
	return join(dirname(primaryRoot), `${basename(primaryRoot)}.worktrees`)
}

/**
 * The path of slot `n`: `<parent>/<repo>.worktrees/<repo>-<n>`. The library assigns `n` and the
 * caller cannot, so the name stays meaningless and true for the worktree's whole life; what it is
 * for lives in its branch and lease holder, which change on reuse (decision 2026-10-05, E-TH-7).
 */
export function slotPath(primaryRoot: string, n: number): string {
	return join(worktreesDir(primaryRoot), `${basename(primaryRoot)}-${n}`)
}

/**
 * The slot number of a worktree root, or `undefined` when the root is not one of the library's slots.
 * Both paths are normalized (`normalizeWorktreePath`). `n` is a positive integer with no leading
 * zero, so `repo-01` is not slot 1.
 */
export function slotNumber(primaryRoot: string, worktreeRoot: string): number | undefined {
	if (dirname(worktreeRoot) !== worktreesDir(primaryRoot)) return undefined
	const prefix = `${basename(primaryRoot)}-`
	const name = basename(worktreeRoot)
	if (!name.startsWith(prefix)) return undefined
	const digits = name.slice(prefix.length)
	return /^[1-9]\d*$/.test(digits) ? Number(digits) : undefined
}
