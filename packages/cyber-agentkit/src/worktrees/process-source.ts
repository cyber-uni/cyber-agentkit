import { readdir, readFile, readlink } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * One process as the probe sees it. Every field but `pid` may be missing: a process can exit
 * mid-read, and another user's process hides its `exe`, `cwd`, and `environ`.
 */
export interface ProcessInfo {
	pid: number
	/** Parent pid; absent when unreadable. */
	ppid?: number | undefined
	/** Resolved executable path, with any ` (deleted)` suffix removed. */
	exe?: string | undefined
	/** The command line; empty for a kernel thread or an unreadable process. */
	argv: readonly string[]
	/** Resolved working directory, with any ` (deleted)` suffix removed. */
	cwd?: string | undefined
	/** The process's environment; absent when unreadable. */
	env?: Readonly<Record<string, string>> | undefined
}

/**
 * Lists every process the caller can see, or `null` when this platform has no supported way to read
 * another process's executable and working directory. Inject one to run the probe on fixtures, or on
 * a platform the default does not cover.
 */
export type ProcessSource = () => Promise<readonly ProcessInfo[] | null>

/**
 * Reads processes from a Linux `/proc` (or a mounted copy at `procRoot`). On any other platform the
 * default root returns `null`: macOS would need `proc_pidinfo` (E-PROC-OS2), and Windows has no
 * documented way to read another process's cwd (E-PROC-OS3).
 */
export function procfsProcessSource(procRoot = '/proc'): ProcessSource {
	return async () => {
		if (procRoot === '/proc' && process.platform !== 'linux') return null
		let names: string[]
		try {
			names = await readdir(procRoot)
		} catch {
			return null
		}
		const processes = await Promise.all(
			names.filter((name) => /^\d+$/.test(name)).map((name) => readProcess(join(procRoot, name), Number(name))),
		)
		return processes.filter((info): info is ProcessInfo => info !== undefined)
	}
}

async function readProcess(dir: string, pid: number): Promise<ProcessInfo | undefined> {
	const [stat, cmdline, exe, cwd, environ] = await Promise.all([
		readText(join(dir, 'stat')),
		readText(join(dir, 'cmdline')),
		readLink(join(dir, 'exe')),
		readLink(join(dir, 'cwd')),
		readText(join(dir, 'environ')),
	])
	// No `stat` means the process exited between the directory listing and the read.
	if (stat === undefined) return undefined
	const info: ProcessInfo = { pid, argv: cmdline ? splitNul(cmdline) : [] }
	// `comm` sits in parentheses and may itself hold `)`, so the fields start after the last one.
	const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1])
	if (Number.isInteger(ppid)) info.ppid = ppid
	if (exe !== undefined) info.exe = exe
	if (cwd !== undefined) info.cwd = cwd
	if (environ !== undefined) {
		const env: Record<string, string> = {}
		for (const entry of splitNul(environ)) {
			const eq = entry.indexOf('=')
			if (eq > 0) env[entry.slice(0, eq)] = entry.slice(eq + 1)
		}
		info.env = env
	}
	return info
}

const splitNul = (text: string) => text.split('\0').filter((part) => part.length > 0)

async function readText(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, 'utf8')
	} catch {
		return undefined
	}
}

/** The kernel appends ` (deleted)` to a link whose target is gone, as after an in-place
 * auto-update of the Copilot CLI (E-PROC-COP1). */
async function readLink(path: string): Promise<string | undefined> {
	try {
		return (await readlink(path)).replace(/ \(deleted\)$/, '')
	} catch {
		return undefined
	}
}
