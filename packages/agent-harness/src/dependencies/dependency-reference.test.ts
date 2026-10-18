import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { renderDependencyReference } from './dependency-reference.js'

describe('renderDependencyReference', () => {
	it('equals the committed references/plugin-dependencies.md (run pnpm run generate:references)', () => {
		const committed = readFileSync(new URL('../../references/plugin-dependencies.md', import.meta.url), 'utf8')
		expect(committed).toBe(renderDependencyReference())
	})

	it('names every harness that has no dependency field', () => {
		const text = renderDependencyReference()
		expect(text).toContain('`cursor`')
		expect(text).toContain('`codex`')
		expect(text).not.toMatch(/`claude-code`, /)
	})
})
