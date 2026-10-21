import { describe, expect, it } from 'vitest'

import { harnessIds } from '../harness/harness-id.js'
import { supportsPluginDependencies } from './plugin-dependencies.js'

describe('supportsPluginDependencies', () => {
	it('is true only for Claude Code', () => {
		expect(harnessIds.filter(supportsPluginDependencies)).toEqual(['claude-code'])
	})
})
