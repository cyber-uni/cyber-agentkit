import { execFile } from 'node:child_process'

export type GhResult = { ok: boolean; stdout: string; stderr: string }

/** Runs the GitHub CLI. Every registry request goes through it, so a test can stand in for GitHub. */
export type Gh = (args: readonly string[]) => Promise<GhResult>

export const gh: Gh = (args) =>
	new Promise((resolve) => {
		execFile('gh', [...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
			resolve({
				ok: !error,
				stdout: String(stdout ?? '').trim(),
				stderr: String(stderr ?? '').trim() || (error?.message ?? ''),
			})
		})
	})
