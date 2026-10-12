import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { harnessIds } from '../harness/harness-id.js'
import { skillInvocation } from '../skills/skill-invocation.js'

/** The `reference` skill this package ships as a plugin, beside `src/`. */
function skillFile(path: string): string {
	return readFileSync(new URL(`../../skills/reference/${path}`, import.meta.url), 'utf8')
}

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
	name: string
	version: string
}
const plugin = JSON.parse(readFileSync(new URL('../../plugin.json', import.meta.url), 'utf8')) as { name: string }

describe('the reference skill', () => {
	it('can be typed by the user', () => {
		expect(skillFile('SKILL.md')).not.toMatch(/^user-invocable: false$/m)
	})

	it("pins the npx fallback to this package's exact version, kept in step by scripts/sync-skill-pin.mjs", () => {
		const pins = [...skillFile('SKILL.md').matchAll(/npx -y (\S+) reference/g)].map(([, pin]) => pin)
		expect(pins).toEqual([`${manifest.name}@${manifest.version}`])
	})

	it("lists each harness's typed form as skillInvocation names it", () => {
		const rows = harnessIds.map((harness) => {
			const invocation = skillInvocation(harness, { plugin: plugin.name, skill: 'reference' })
			return invocation
				? `| \`${harness}\` | \`${invocation.text}\` | ${invocation.namespaced ? 'yes' : 'no'} |`
				: `| \`${harness}\` | no typed form recorded | — |`
		})
		const table = /<!-- generated: harness invocations -->\n([\s\S]*?)<!-- \/generated -->/.exec(skillFile('README.md'))
		// `plugin build` adds the pnpm install name beside each typed form; it is not part of skillInvocation.
		const built = table?.[1]?.replace(/ \(pnpm install: `[^`]*`\)/g, '')
		expect(built?.trim().split('\n').slice(2)).toEqual(rows)
	})
})
