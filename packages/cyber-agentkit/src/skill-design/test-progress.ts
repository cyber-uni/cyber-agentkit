import { readFileSync } from 'node:fs'
import type { TestPlan } from './test-plan.js'
import type { TestResult } from './test-result.js'

/** One line of the progress file `skill test` and its promptfoo run share (R98). */
export type ProgressLine = {
	event: 'start' | 'end'
	case: string
	/** `skill` for the run with the skill, `baseline` for the other arm. */
	arm: string
	/** 1-based. */
	run: number
	kind?: string
	/** On `end`: `pass`, `fail`, `fired`, `not fired`, or `not run`. */
	outcome?: string
	/** On `end` with `not run`: why. */
	reason?: string
	durationMs?: number
	/** When the line was written, in epoch milliseconds. */
	t: number
}

/** How many runs promptfoo makes for a plan: an outcome case runs in both arms, a trigger case only with the skill. */
export function plannedRuns(plan: TestPlan): number {
	const triggers = plan.cases.filter((item) => item.kind === 'trigger').length
	return (triggers + (plan.cases.length - triggers) * 2) * plan.runs
}

/** `1m05s`, or `48s` under a minute. */
function clock(ms: number): string {
	const seconds = Math.round(ms / 1000)
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

/** The line written before the first run: the count, and about how long and how much the last saved result took (R97). */
export function planLine(plan: TestPlan, last?: Pick<TestResult, 'durationMs' | 'cost'> | undefined): string {
	const triggers = plan.cases.filter((item) => item.kind === 'trigger').length
	const arms =
		triggers === 0
			? 'with and without the skill'
			: triggers === plan.cases.length
				? 'with the skill'
				: 'outcome cases with and without the skill, trigger cases with it'
	let line = `skill test: ${plannedRuns(plan)} runs (${plan.cases.length} cases × ${plan.runs}, ${arms})`
	const before: string[] = []
	if (last?.durationMs) {
		const minutes = last.durationMs / 60_000
		before.push(minutes < 1 ? `${Math.max(1, Math.round(last.durationMs / 1000))} s` : `${Math.round(minutes)} min`)
	}
	if (last?.cost) before.push(`$${last.cost.toFixed(2)}`)
	if (before.length) line += `; last time about ${before.join(', ')}`
	return line
}

export type ProgressWatch = {
	file: string
	total: number
	write: (line: string) => void
	/** Milliseconds with no run ended before a "still running" line, and between repeats. Default 30000 (R99). */
	heartbeatMs?: number | undefined
	/** How often the file is read. Default 500. */
	pollMs?: number | undefined
	now?: (() => number) | undefined
}

/** Reads the progress file as promptfoo appends to it: one line per finished run, and a heartbeat while none finishes (R98, R99). `stop` reads what is left and ends. */
export function watchProgress(options: ProgressWatch): { stop: () => void } {
	const { file, total, write } = options
	const heartbeatMs = options.heartbeatMs ?? 30_000
	const now = options.now ?? Date.now
	const running = new Map<string, number>()
	let offset = 0
	let done = 0
	let quiet = now()

	const key = (line: ProgressLine) => `${line.case}|${line.arm}|${line.run}`
	function handle(line: ProgressLine): void {
		if (line.event === 'start') {
			running.set(key(line), line.t)
			return
		}
		running.delete(key(line))
		done++
		quiet = now()
		const arm = line.arm === 'skill' ? 'with skill' : 'without skill'
		const outcome = line.outcome === 'not run' ? `not run: ${line.reason ?? 'no reason'}` : line.outcome
		const took = line.durationMs === undefined ? '' : `, ${clock(line.durationMs)}`
		write(`[${done}/${total}] ${line.case} run ${line.run} (${arm}): ${outcome}${took}`)
	}

	function poll(beat: boolean): void {
		let data: Buffer | undefined
		try {
			data = readFileSync(file)
		} catch {
			// not written yet
		}
		if (data && data.length > offset) {
			const fresh = data.subarray(offset)
			const end = fresh.lastIndexOf(10)
			if (end >= 0) {
				offset += end + 1
				for (const text of fresh.subarray(0, end).toString('utf8').split('\n')) {
					try {
						handle(JSON.parse(text) as ProgressLine)
					} catch {
						// a line that is not ours: skip it
					}
				}
			}
		}
		if (beat && now() - quiet >= heartbeatMs) {
			quiet = now()
			const longest = running.size ? now() - Math.min(...running.values()) : 0
			const seconds = Math.floor(longest / 1000)
			write(`still running: ${running.size} runs in progress, longest ${Math.floor(seconds / 60)}m${seconds % 60}s`)
		}
	}

	const timer = setInterval(() => poll(true), options.pollMs ?? 500)
	return {
		stop: () => {
			clearInterval(timer)
			poll(false)
		},
	}
}
