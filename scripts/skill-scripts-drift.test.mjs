import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { FIX_COMMAND, findStaleScripts, formatStale } from './skill-scripts-drift.mjs'

describe('findStaleScripts', () => {
	it('returns only the scripts a fresh build would change, with repository-relative paths', () => {
		const stale = findStaleScripts({
			scripts: [
				{ path: 'skills/a/scripts/a.mjs', source: 'src/a.ts', status: 'unchanged' },
				{ path: 'skills/b/scripts/b.mjs', source: 'src/b.ts', status: 'stale' },
			],
		})
		assert.deepEqual(stale, [
			{
				path: 'packages/cyber-agentkit/skills/b/scripts/b.mjs',
				source: 'packages/cyber-agentkit/src/b.ts',
				status: 'stale',
			},
		])
	})

	it('treats any status other than unchanged as stale, such as a script not yet built', () => {
		const stale = findStaleScripts({
			scripts: [{ path: 'skills/a/scripts/a.mjs', source: 'src/a.ts', status: 'missing' }],
		})
		assert.equal(stale.length, 1)
	})

	it('throws when the report carries no scripts list, rather than passing', () => {
		assert.throws(() => findStaleScripts({}), /lists no scripts/)
	})
})

describe('formatStale', () => {
	it('names each stale file and the command that fixes it', () => {
		const message = formatStale([
			{
				path: 'packages/cyber-agentkit/skills/b/scripts/b.mjs',
				source: 'packages/cyber-agentkit/src/b.ts',
				status: 'stale',
			},
		])
		assert.match(message, /packages\/cyber-agentkit\/skills\/b\/scripts\/b\.mjs/)
		assert.ok(message.includes(FIX_COMMAND))
	})
})
