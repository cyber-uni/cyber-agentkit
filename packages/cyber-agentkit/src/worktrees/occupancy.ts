import { sep } from 'node:path'

import { normalizeWorktreePath } from './list-worktrees.js'
import { type ProcessInfo, type ProcessSource, procfsProcessSource } from './process-source.js'
import { type SessionHarnessId, type SessionSignature, sessionSignatures } from './session-signatures.js'

/** A live agent session working inside a worktree. A wrapper and its native or relaunched child are
 * one session (E-PROC-KILO1, E-PROC-GEM1). */
export interface Session {
	harness: SessionHarnessId
	/** The session's top process: the wrapper when there is one. */
	pid: number
	/** Every process of the session, the wrapper and its child; any one inside the worktree counts. */
	pids: readonly number[]
	/** The session id, when one of its tool processes carries it in the harness's link variable. */
	sessionId?: string | undefined
	/** Evidence IDs the match rests on. */
	research: readonly string[]
}

/**
 * Why a process left in a worktree was reported:
 * - `session-gone`: its link variable names no live session (E-PROC-CC2, E-PROC-CX2).
 * - `helper-orphaned`: a per-session helper, such as Cursor's worker, outlived its session
 *   (E-PROC-CUR3).
 * - `harness-idle`: a helper shared by every session of a harness, such as Cline's hub, with no
 *   session of that harness alive (E-PROC-CLINE1).
 * - `no-link`: no live session above it and no link variable, so orphaned and user-started look the
 *   same (cline, OpenHands, crush tool processes, or a user's own terminal).
 * - `unresolved-link`: its session id matches none known, but a live session of that harness has not
 *   revealed its id, so the process may still be that session's.
 * - `env-unreadable`: no live session above it and its environment could not be read.
 */
export type LeftoverReason =
	| 'session-gone'
	| 'helper-orphaned'
	| 'harness-idle'
	| 'no-link'
	| 'unresolved-link'
	| 'env-unreadable'

/** A non-session process inside a worktree with no live session above it. Reported, never killed. */
export interface LeftoverProcess {
	pid: number
	ppid?: number | undefined
	argv: readonly string[]
	cwd: string
	/** The harness its link variable or helper signature names, when known. */
	harness?: SessionHarnessId | undefined
	reason: LeftoverReason
}

export interface WorktreeOccupancy {
	/**
	 * A live agent session works here, so the worktree must not be recycled or removed. Dev services
	 * do not count. When the probe is unverified this is `strict`.
	 */
	busy: boolean
	/** `false` when the platform's processes could not be read; `occupants` is then empty, not proof. */
	verified: boolean
	/** Every live session found inside; never limited in number or role. */
	occupants: Session[]
	/** Processes no live session launched, provably: safe for a caller to reclaim. */
	lingering: LeftoverProcess[]
	/** Processes with no live session above them whose launcher cannot be told; reported, not lingering. */
	unlinked: LeftoverProcess[]
}

export interface ProbeOptions {
	/** Where processes come from; defaults to Linux `/proc`. */
	source?: ProcessSource | undefined
}

export interface OccupancyOptions {
	/** Treat an unverified probe as busy. Off by default: reuse proceeds, reported as unverified. */
	strict?: boolean | undefined
	/**
	 * Roots of worktrees nested inside this one (Claude Code puts its worktrees under
	 * `<repo>/.claude/worktrees/`, E-PROC-CC5); processes there belong to them, not to this one.
	 */
	nested?: readonly string[] | undefined
}

/** One snapshot of the process table, answering for any number of worktrees. */
export interface ProcessProbe {
	verified: boolean
	/** @param worktreeRoot absolute, symlinks resolved, as `WorktreeEntry.root` gives it. */
	occupancy(worktreeRoot: string, options?: OccupancyOptions): WorktreeOccupancy
}

interface SessionGroup {
	signature: SessionSignature
	members: ProcessInfo[]
	ids: Set<string>
}

/**
 * Snapshots processes once and classifies each against the session signature table. Read-only: the
 * probe never signals or kills a process. A harness missing from the table is invisible to it.
 */
export async function probeProcesses(options: ProbeOptions = {}): Promise<ProcessProbe> {
	const processes = await (options.source ?? procfsProcessSource())()
	if (processes === null) {
		return {
			verified: false,
			occupancy: (_root, occupancyOptions) => ({
				busy: occupancyOptions?.strict === true,
				verified: false,
				occupants: [],
				lingering: [],
				unlinked: [],
			}),
		}
	}
	return classify(processes)
}

/**
 * The live agent sessions inside a worktree, or `undefined` when the probe could not read this
 * platform's processes.
 */
export async function occupants(
	worktreeRoot: string,
	options: ProbeOptions & Pick<OccupancyOptions, 'nested'> = {},
): Promise<Session[] | undefined> {
	const probe = await probeProcesses(options)
	if (!probe.verified) return undefined
	const nested = options.nested && (await Promise.all(options.nested.map(normalizeWorktreePath)))
	return probe.occupancy(await normalizeWorktreePath(worktreeRoot), { nested }).occupants
}

function classify(processes: readonly ProcessInfo[]): ProcessProbe {
	const byPid = new Map(processes.map((info) => [info.pid, info]))
	const sessionOf = new Map<number, SessionSignature>()
	const helperOf = new Map<number, { signature: SessionSignature; scope: 'session' | 'shared' }>()
	for (const info of processes) {
		for (const signature of sessionSignatures) {
			const scope = signature.helper?.(info)
			if (scope) {
				helperOf.set(info.pid, { signature, scope })
				break
			}
			if (signature.isSession(info)) {
				sessionOf.set(info.pid, signature)
				break
			}
		}
	}

	const parentOf = (info: ProcessInfo) =>
		info.ppid === undefined || info.ppid === info.pid ? undefined : byPid.get(info.ppid)

	// A session whose parent is a session of the same harness is that session's native or relaunched
	// half; fold it into the parent's group.
	const groupOf = new Map<number, SessionGroup>()
	const groupRoot = (info: ProcessInfo): ProcessInfo => {
		const parent = parentOf(info)
		return parent && sessionOf.get(parent.pid) === sessionOf.get(info.pid) ? groupRoot(parent) : info
	}
	for (const [pid, signature] of sessionOf) {
		const root = groupRoot(byPid.get(pid)!)
		let group = groupOf.get(root.pid)
		if (!group) {
			group = { signature, members: [], ids: new Set() }
			groupOf.set(root.pid, group)
		}
		group.members.push(byPid.get(pid)!)
		groupOf.set(pid, group)
	}
	const groups = [...new Set(groupOf.values())]

	// Test "a live session is an ancestor", never "the parent is pid 1": on WSL orphans go to
	// `/init` (E-PROC-OS1).
	const nearestSession = (info: ProcessInfo): SessionGroup | undefined => {
		const seen = new Set<number>()
		for (let parent = parentOf(info); parent && !seen.has(parent.pid); parent = parentOf(parent)) {
			seen.add(parent.pid)
			const group = groupOf.get(parent.pid)
			if (group) return group
		}
		return undefined
	}

	// A session's own environment holds no id (E-PROC-ENV1); its tool processes reveal it.
	for (const info of processes) {
		if (sessionOf.has(info.pid)) continue
		const group = nearestSession(info)
		const idVar = group?.signature.link?.id
		const id = idVar && info.env?.[idVar]
		if (group && id) group.ids.add(id)
	}

	const liveGroups = (harness: SessionHarnessId) => groups.filter((group) => group.signature.harness === harness)

	type Link = 'live' | 'dead' | 'unknown'
	const resolveLink = (signature: SessionSignature, env: Readonly<Record<string, string>>): Link | undefined => {
		const live = liveGroups(signature.harness)
		const pidVar = signature.link?.pid
		if (pidVar && env[pidVar]) {
			const pid = Number(env[pidVar])
			return live.some((group) => group.members.some((member) => member.pid === pid)) ? 'live' : 'dead'
		}
		const idVar = signature.link?.id
		const id = idVar && env[idVar]
		if (!id) return undefined
		if (live.some((group) => group.ids.has(id))) return 'live'
		return live.every((group) => group.ids.size > 0) ? 'dead' : 'unknown'
	}

	const leftover = (info: ProcessInfo): Omit<LeftoverProcess, 'cwd'> | undefined => {
		const helper = helperOf.get(info.pid)
		if (helper?.scope === 'shared') {
			if (liveGroups(helper.signature.harness).length > 0) return undefined
			return { pid: info.pid, argv: info.argv, harness: helper.signature.harness, reason: 'harness-idle' }
		}
		if (nearestSession(info)) return undefined
		if (helper) return { pid: info.pid, argv: info.argv, harness: helper.signature.harness, reason: 'helper-orphaned' }
		if (!info.env) return { pid: info.pid, argv: info.argv, reason: 'env-unreadable' }
		const links = sessionSignatures
			.map((signature) => ({ signature, link: resolveLink(signature, info.env!) }))
			.filter((entry): entry is { signature: SessionSignature; link: Link } => entry.link !== undefined)
		if (links.some((entry) => entry.link === 'live')) return undefined
		if (links.length === 0) return { pid: info.pid, argv: info.argv, reason: 'no-link' }
		// A process can carry several harnesses' markers when one harness ran inside another; it is
		// lingering only when every one of them names a session that is gone.
		const reason = links.every((entry) => entry.link === 'dead') ? 'session-gone' : 'unresolved-link'
		return { pid: info.pid, argv: info.argv, harness: links[0]!.signature.harness, reason }
	}

	return {
		verified: true,
		occupancy(worktreeRoot, options = {}) {
			const within = (cwd: string | undefined, root: string) =>
				cwd !== undefined && (cwd === root || cwd.startsWith(root.endsWith(sep) ? root : root + sep))
			const inside = (cwd: string | undefined) =>
				within(cwd, worktreeRoot) && !(options.nested ?? []).some((root) => within(cwd, root))

			const found: Session[] = []
			for (const group of groups) {
				if (!group.members.some((member) => inside(member.cwd))) continue
				const session: Session = {
					harness: group.signature.harness,
					pid: (group.members.find((member) => groupRoot(member) === member) ?? group.members[0]!).pid,
					pids: group.members.map((member) => member.pid).sort((a, b) => a - b),
					research: group.signature.research,
				}
				if (group.ids.size === 1) session.sessionId = [...group.ids][0]
				found.push(session)
			}

			const lingering: LeftoverProcess[] = []
			const unlinked: LeftoverProcess[] = []
			for (const info of processes) {
				if (sessionOf.has(info.pid) || !inside(info.cwd)) continue
				const entry = leftover(info)
				if (!entry) continue
				const report: LeftoverProcess = { ...entry, cwd: info.cwd! }
				if (info.ppid !== undefined) report.ppid = info.ppid
				const certain =
					entry.reason === 'session-gone' || entry.reason === 'helper-orphaned' || entry.reason === 'harness-idle'
				;(certain ? lingering : unlinked).push(report)
			}

			return { busy: found.length > 0, verified: true, occupants: found, lingering, unlinked }
		},
	}
}
