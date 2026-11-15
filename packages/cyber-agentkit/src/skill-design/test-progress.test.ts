import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { watchProgress } from './test-progress.js'

describe('watchProgress and the usage limit (R162)', () => {
	const limitText = "You've hit your 5-hour limit · resets 4:40am (America/Los_Angeles)"
	const end = (run: number, extra: Record<string, unknown>) => ({
		event: 'end',
		case: 'case-a',
		arm: 'skill',
		run,
		kind: 'outcome',
		t: 0,
		...extra,
	})

	it('says once that the limit was reached, counts the runs that never started without a line each, and ends with the runs left', () => {
		const file = join(mkdtempSync(join(tmpdir(), 'progress-limit-')), 'progress.jsonl')
		const lines = [
			end(1, { outcome: 'pass', durationMs: 1000 }),
			end(2, {
				outcome: 'limit reached',
				reason: limitText,
				started: true,
				resets: '4:40am (America/Los_Angeles)',
				durationMs: 2000,
			}),
			end(3, { outcome: 'limit reached', reason: limitText, started: false }),
			end(4, { outcome: 'limit reached', reason: limitText, started: false }),
		]
		writeFileSync(file, lines.map((line) => `${JSON.stringify(line)}\n`).join(''))
		const written: string[] = []
		const watch = watchProgress({ file, total: 4, write: (line) => written.push(line), pollMs: 60_000 })
		watch.stop()
		expect(written).toEqual([
			'[1/4] case-a run 1 (with skill): pass, 1s',
			`usage limit reached: ${limitText}; no new run starts, and the runs left can run after it resets (4:40am (America/Los_Angeles))`,
			`[2/4] case-a run 2 (with skill): limit reached: ${limitText}, 2s`,
			'limit reached: 3 of 4 runs left; run `skill test --resume` after it resets (4:40am (America/Los_Angeles)) to run only them',
		])
	})

	it('says nothing of a limit when no run reached one', () => {
		const file = join(mkdtempSync(join(tmpdir(), 'progress-limit-')), 'progress.jsonl')
		writeFileSync(file, `${JSON.stringify(end(1, { outcome: 'fail', durationMs: 1000 }))}\n`)
		const written: string[] = []
		watchProgress({ file, total: 1, write: (line) => written.push(line), pollMs: 60_000 }).stop()
		expect(written).toEqual(['[1/1] case-a run 1 (with skill): fail, 1s'])
	})
})
