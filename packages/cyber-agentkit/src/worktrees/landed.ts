import type { Exec } from './exec.js'

/**
 * Which signal established that a branch's work has landed on the default branch, in the cost order
 * the signals run. Each is positive-only: a signal that cannot match never contributes a `false`, so
 * two signals can never contradict each other.
 *
 * - `ancestor`: the branch tip is an ancestor of the default branch (`git branch --merged`).
 * - `upstream-gone`: the branch's remote-tracking ref has disappeared (`[gone]`), meaning the forge
 *   merged the pull request and deleted its head branch. Only as fresh as the caller's last
 *   `git fetch --prune`; this module never fetches.
 * - `squash-patch`: the branch, collapsed to one commit, is already applied on the default branch
 *   (`git cherry`). Matches a clean squash or rebase merge, not a hand-edited one.
 * - `forge`: the forge reports a merged pull request for the branch. Needs network and auth, so it
 *   runs only when the caller passes a `ForgeMergedProbe`.
 */
export type LandedSignal = 'ancestor' | 'upstream-gone' | 'squash-patch' | 'forge'

/** Asks the forge whether `branch` is the head of a merged pull request. `undefined` means the forge
 * could not say, which, like `false`, clears nothing. */
export type ForgeMergedProbe = (branch: string) => Promise<boolean | undefined>

export interface LandedVerdict {
	/** Absent when undeterminable: no branch, or no default branch to compare against. */
	merged?: boolean | undefined
	/** The signal behind a `merged: true`. */
	signal?: LandedSignal | undefined
}

/**
 * The ref "landed" is measured against: `origin/HEAD` first, because landed means landed upstream,
 * then the branch checked out in the primary checkout. Undefined when neither answers.
 */
export async function defaultBranchRef(
	exec: Exec,
	primaryRoot: string,
	primaryBranch: string | undefined,
): Promise<string | undefined> {
	const originHead = await exec('git', ['-C', primaryRoot, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
	return originHead || primaryBranch
}

/** The repo-wide inputs the per-branch check reuses, read once rather than once per worktree. */
export interface LandedContext {
	exec: Exec
	primaryRoot: string
	target: string | undefined
	merged: Set<string> | undefined
	goneUpstream: Set<string> | undefined
	forge?: ForgeMergedProbe | undefined
}

export async function readLandedContext(
	exec: Exec,
	primaryRoot: string,
	target: string | undefined,
	forge?: ForgeMergedProbe | undefined,
): Promise<LandedContext> {
	const [merged, goneUpstream] = await Promise.all([
		readMergedBranches(exec, primaryRoot, target),
		readGoneUpstreamBranches(exec, primaryRoot),
	])
	return { exec, primaryRoot, target, merged, goneUpstream, forge }
}

/**
 * Runs the signals for one branch in cost order and stops at the first positive. Only `ancestor` may
 * seed a `false`; no later signal can turn a `true` into a `false`.
 */
export async function resolveLanded(branch: string | undefined, context: LandedContext): Promise<LandedVerdict> {
	if (!branch) return {}
	if (context.merged?.has(branch)) return { merged: true, signal: 'ancestor' }
	const seed: LandedVerdict = context.merged ? { merged: false } : {}
	if (context.goneUpstream?.has(branch)) return { merged: true, signal: 'upstream-gone' }
	if (context.target && (await isSquashApplied(context.exec, context.primaryRoot, context.target, branch)))
		return { merged: true, signal: 'squash-patch' }
	if ((await context.forge?.(branch)) === true) return { merged: true, signal: 'forge' }
	return seed
}

async function readMergedBranches(
	exec: Exec,
	primaryRoot: string,
	target: string | undefined,
): Promise<Set<string> | undefined> {
	if (!target) return undefined
	const out = await exec('git', ['-C', primaryRoot, 'branch', '--format=%(refname:short)', '--merged', target])
	if (out === null) return undefined
	return new Set(
		out
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean),
	)
}

async function readGoneUpstreamBranches(exec: Exec, primaryRoot: string): Promise<Set<string> | undefined> {
	// Tab-separated: a ref name cannot hold a tab, but the track field can hold spaces.
	const out = await exec('git', [
		'-C',
		primaryRoot,
		'for-each-ref',
		'--format=%(refname:short)\t%(upstream:track)',
		'refs/heads/',
	])
	if (out === null) return undefined
	const gone = new Set<string>()
	for (const line of out.split('\n')) {
		const tab = line.indexOf('\t')
		if (tab !== -1 && line.slice(tab + 1).trim() === '[gone]') gone.add(line.slice(0, tab))
	}
	return gone
}

/**
 * Whether the branch, collapsed to one synthetic commit (`commit-tree <branch>^{tree} -p <merge-base>`),
 * is already applied on `target` by patch id (`git cherry`). Writes one unreferenced commit object that
 * ordinary gc collects. The identity is inline because `commit-tree` refuses on a machine with no git
 * identity configured, such as a CI runner.
 */
async function isSquashApplied(exec: Exec, primaryRoot: string, target: string, branch: string): Promise<boolean> {
	const base = await exec('git', ['-C', primaryRoot, 'merge-base', target, branch])
	if (!base) return false
	const synthetic = await exec('git', [
		'-c',
		'user.name=agent-harness',
		'-c',
		'user.email=probe@agent-harness.invalid',
		'-C',
		primaryRoot,
		'commit-tree',
		`${branch}^{tree}`,
		'-p',
		base,
		'-m',
		'agent-harness squash probe',
	])
	if (!synthetic) return false
	const cherry = await exec('git', ['-C', primaryRoot, 'cherry', target, synthetic])
	return cherry?.split('\n').some((line) => line.startsWith('-')) ?? false
}

/**
 * A `ForgeMergedProbe` backed by the GitHub CLI: `gh pr list --head <branch> --state merged`. Every
 * way it can fail (no `gh`, no auth, no network, a non-GitHub origin) resolves `undefined`.
 */
export function ghForgeMergedProbe(exec: Exec, primaryRoot: string): ForgeMergedProbe {
	return async (branch) => {
		const url = await exec('git', ['-C', primaryRoot, 'remote', 'get-url', 'origin'])
		const slug = url ? /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url.trim())?.[1] : undefined
		if (!slug) return undefined
		const out = await exec('gh', [
			'pr',
			'list',
			'--repo',
			slug,
			'--head',
			branch,
			'--state',
			'merged',
			'--json',
			'number',
			'--limit',
			'1',
		])
		if (out === null) return undefined
		try {
			const prs: unknown = JSON.parse(out)
			return Array.isArray(prs) ? prs.length > 0 : undefined
		} catch {
			return undefined
		}
	}
}
