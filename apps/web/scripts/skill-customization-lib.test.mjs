import assert from 'node:assert/strict'
import { test } from 'node:test'
import { customizationSection } from './skill-customization-lib.mjs'

const text = (facts) => customizationSection(facts).join('\n')

test('a skill that loads no reference says so in one line', () => {
	assert.equal(
		text({ loads: [], interfaces: [] }),
		'## Customization\n\nThis skill loads no reference, so it has no customization points.\n',
	)
})

test('each reference gets its description and what ships for it', () => {
	const out = text({
		loads: [
			{ name: 'a.autonomy', description: 'How much | it does.', found: true, bundledDefault: true, plugins: [] },
			{ name: 'a.trust', description: 'Trusted sources.', found: true, bundledDefault: false, plugins: ['p'] },
			{ name: 'a.gone', found: false, bundledDefault: false, plugins: [] },
		],
		interfaces: [],
	})
	assert.match(out, /\| `a\.autonomy` \| How much \\\| it does\. \| A default bundled with the skill \|/)
	assert.match(out, /\| `a\.trust` \| Trusted sources\. \| The `p` plugin \|/)
	assert.match(out, /\| `a\.gone` \| No description\. \| Nothing; the name answers only once you create it \|/)
	assert.match(out, /reference where a\.autonomy/)
	assert.doesNotMatch(out, /### Implementations/)
})

test('an implementation of an interface lists the implementations and the one in use', () => {
	const out = text({
		loads: [
			{
				name: 'a.aspect',
				description: 'd',
				found: true,
				bundledDefault: false,
				plugins: ['p'],
				implements: { id: 'a.aspect', pins: ['p/a.aspect', 'q/a.aspect'], inUse: 'p/a.aspect' },
			},
		],
		interfaces: [{ id: 'b.recipe', pins: [] }],
	})
	assert.match(
		out,
		/- `a\.aspect` implements the `a\.aspect` interface\. Implementations: `p\/a\.aspect` \(in use\), `q\/a\.aspect`\./,
	)
	assert.match(
		out,
		/- The skill loads every implementation of the `b\.recipe` interface\. Implementations: none ships yet\./,
	)
})
