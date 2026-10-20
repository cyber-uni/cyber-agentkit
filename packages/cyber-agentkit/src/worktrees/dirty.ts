import type { Exec } from './exec.js'

export interface DirtyOptions {
	exec: Exec
	/**
	 * Paths, relative to the worktree root, whose changes do not count — a tool's own marker file, such
	 * as cyberlegion's `.agents/cyberlegion/config.json`. Passed to git as `:(exclude)` pathspecs.
	 */
	ignore?: readonly string[] | undefined
}

/**
 * Whether a checkout has uncommitted changes, tracked or untracked, or `undefined` when git could not
 * say. `undefined` is not `false`: a caller deciding whether a worktree is safe to reuse must not read
 * an unanswered question as a clean tree.
 *
 * `--untracked-files=all` is explicit because a repo's `status.showUntrackedFiles=no` would otherwise
 * hide untracked work.
 */
export async function readDirty(worktreeRoot: string, options: DirtyOptions): Promise<boolean | undefined> {
	const args = ['-C', worktreeRoot, 'status', '--porcelain', '--untracked-files=all']
	if (options.ignore?.length) args.push('--', '.', ...options.ignore.map((path) => `:(exclude)${path}`))
	const out = await options.exec('git', args)
	return out === null ? undefined : out.length > 0
}
