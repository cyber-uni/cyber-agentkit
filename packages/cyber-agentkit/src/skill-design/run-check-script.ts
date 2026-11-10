import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { CheckOutcome } from './skill-check-types.js'

export type ScriptRun = { outcomes: CheckOutcome[] } | { problem: string; broken: boolean }

const statuses = new Set(['pass', 'fail', 'not-checked'])

/** Reads a check script's stdout: `{"checks": [{"id", "status", "message"?, "file"?}]}`. */
export function readScriptOutput(stdout: string): CheckOutcome[] | string {
	let value: unknown
	try {
		value = JSON.parse(stdout)
	} catch {
		return 'its output is not JSON'
	}
	const checks = (value as { checks?: unknown })?.checks
	if (!Array.isArray(checks)) return 'its output has no `checks` list'
	const outcomes: CheckOutcome[] = []
	for (const item of checks) {
		const { id, status, message, file } = (item ?? {}) as Record<string, unknown>
		if (typeof id !== 'string' || !statuses.has(status as string))
			return 'a check in its output has no `id` or `status`'
		const outcome: CheckOutcome = { id, status: status as CheckOutcome['status'] }
		if (typeof message === 'string') outcome.message = message
		if (typeof file === 'string') outcome.file = file
		outcomes.push(outcome)
	}
	return outcomes
}

/** Runs a check script with Node on the skill folder; it exits 0 whatever it found and prints its outcomes. */
export function runCheckScript(script: string, skillFolder: string): ScriptRun {
	if (!existsSync(script)) return { problem: `its check script ${script} does not exist`, broken: true }
	let stdout: string
	try {
		stdout = execFileSync(process.execPath, [script, skillFolder], {
			encoding: 'utf8',
			timeout: 60_000,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
	} catch (error) {
		const reason = (error as { stderr?: string }).stderr?.trim().split('\n')[0] || (error as Error).message
		return { problem: `its check script ${script} failed: ${reason}`, broken: true }
	}
	const read = readScriptOutput(stdout)
	return typeof read === 'string'
		? { problem: `its check script ${script}: ${read}`, broken: true }
		: { outcomes: read }
}
