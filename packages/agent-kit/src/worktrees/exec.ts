import { execFile } from 'node:child_process'

/**
 * Runs a command and resolves its trimmed stdout, or `null` on any failure. Every git and forge call
 * in this folder goes through it, so a caller can drive the whole worktree layer with a fake or with
 * its own environment (a pinned `GIT_CONFIG_GLOBAL`, a different `PATH`).
 */
export type Exec = (cmd: string, args: readonly string[]) => Promise<string | null>

/** The default `Exec`: `execFile` with stderr captured, never inherited, because routine failures
 * (no `origin/HEAD`, a branch with no upstream) would otherwise spam the caller's terminal. */
export const nodeExec: Exec = (cmd, args) =>
	new Promise((resolve) => {
		execFile(cmd, [...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
			resolve(error ? null : stdout.trim())
		})
	})
