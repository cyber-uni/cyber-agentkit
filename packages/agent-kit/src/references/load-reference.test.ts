import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadReference } from './load-reference.js'

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), 'load-reference-'))
}

function write(root: string, relPath: string, content: string): void {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
}

describe('loadReference', () => {
	it("patches the plugin's own contribution with a project one, and returns the full record", async () => {
		const root = tempDir()
		const plugin = tempDir()
		write(root, '.git/HEAD', 'ref: refs/heads/main\n')
		write(
			plugin,
			'references/weights.md',
			'---\ndescription: weights\n---\n\n## Testing\n\nweight 3\n\n## Docs\n\nweight 1\n',
		)
		write(root, '.agents/references/weights.md', '## Docs\n\nweight 5\n')

		const resolved = await loadReference('weights', {
			root,
			home: tempDir(),
			platform: 'linux',
			env: {},
			plugin: { name: 'host', root: plugin },
		})

		expect(resolved).toMatchObject({ status: 'found', metadata: { description: 'weights' } })
		expect(resolved.content).toBe('## Testing\n\nweight 3\n\n## Docs\n\nweight 5\n')
		expect(resolved.trace.contributions.map(({ tier }) => tier)).toEqual(['plugin', 'project'])
	})

	it("joins the skill's default when given its folder", async () => {
		const skill = tempDir()
		write(skill, 'SKILL.md', '---\nname: tracker\n---\n')
		write(skill, 'references/weights.default.md', '## Testing\n\ndefault\n')

		const resolved = await loadReference('weights', { root: tempDir(), home: tempDir(), env: {}, defaultSkill: skill })

		expect(resolved).toMatchObject({ status: 'found', content: '## Testing\n\ndefault\n' })
		expect(resolved.trace.stack).toEqual(['default'])
	})

	it("reads the machine's home directory and platform when none is given", async () => {
		const resolved = await loadReference('no-such-reference-anywhere', { root: tempDir(), env: {} })

		expect(resolved).toMatchObject({ status: 'missing', code: 'reference-missing' })
	})

	it('returns a name that is a path as invalid, never throwing', async () => {
		const resolved = await loadReference('../escape', { root: tempDir(), env: {} })

		expect(resolved).toMatchObject({ status: 'invalid', code: 'reference-invalid' })
	})
})
