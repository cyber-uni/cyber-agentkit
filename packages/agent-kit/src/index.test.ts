import { afterEach, describe, expect, it, vi } from 'vitest'

import { detectHarness } from './index.js'

describe('detectHarness', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('reads process.env when no environment is passed', () => {
		vi.stubEnv('CURSOR_AGENT', '1')

		expect(detectHarness().evidence).toContainEqual(
			expect.objectContaining({ harness: 'cursor', signal: 'CURSOR_AGENT' }),
		)
	})
})
