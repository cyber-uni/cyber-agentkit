import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// The common verbs are defined in the package glossary: `check` only reports, and `fix` writes.
const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('the root check script only reports', () => {
	assert.match(scripts.check, /^biome check\b/)
	assert.doesNotMatch(scripts.check, /--write|--fix\b/)
})

test('the root fix script runs Biome with its fixes written', () => {
	assert.equal(scripts.fix, 'biome check --write')
})
