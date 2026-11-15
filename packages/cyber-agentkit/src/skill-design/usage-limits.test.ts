import { describe, expect, it } from 'vitest'
import { recognizeUsageLimit } from './usage-limits.js'

describe('recognizeUsageLimit (R161)', () => {
	it('recognizes the 5-hour limit and when it resets, inside the Agent SDK wrapping', () => {
		expect(
			recognizeUsageLimit(
				"Error calling Claude Agent SDK: Error: Claude Code returned an error result: You've hit your 5-hour limit · resets 4:40am (America/Los_Angeles)",
			),
		).toEqual({
			text: "You've hit your 5-hour limit · resets 4:40am (America/Los_Angeles)",
			resets: '4:40am (America/Los_Angeles)',
		})
	})

	it('recognizes a limit whose message names no reset time', () => {
		expect(recognizeUsageLimit("You've hit your weekly limit")).toEqual({ text: "You've hit your weekly limit" })
	})

	it('finds the message on any line of the error', () => {
		expect(recognizeUsageLimit("first line\nYou've hit your 5-hour limit · resets 11am\nmore")?.resets).toBe('11am')
	})

	it('recognizes nothing in another error', () => {
		expect(recognizeUsageLimit('time limit')).toBeUndefined()
		expect(recognizeUsageLimit('Not logged in')).toBeUndefined()
		expect(recognizeUsageLimit('the turn reached its budget limit')).toBeUndefined()
	})
})
