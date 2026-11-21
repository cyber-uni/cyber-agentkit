import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { renderVerbsPage, verbsSection } from './verbs-page-lib.mjs'

const glossary = readFileSync(
	new URL('../../../packages/cyber-agentkit/.agents/spec/glossary.md', import.meta.url),
	'utf8',
)

const verbs = [
	'check',
	'lint',
	'review',
	'vet',
	'verify',
	'test',
	'doctor',
	'advise',
	'audit',
	'compare',
	'report',
	'fix',
	'repair',
	'enhance',
	'init',
	'setup',
	'config',
	'scaffold',
	'create',
	'add',
	'update',
	'upgrade',
	'migrate',
	'sync',
	'apply',
	'align',
	'modernize',
]

test('the glossary defines each common verb in its Verbs section', () => {
	const section = verbsSection(glossary)
	assert.ok(section, 'the glossary has a "## Verbs" section')
	for (const verb of verbs) assert.match(section, new RegExp(`^- \\*\\*${verb}\\*\\* — \\S`, 'm'), verb)
})

test('no glossary entry calls a doctor a check', () => {
	for (const line of glossary.split('\n').filter((line) => line.startsWith('- **doctor**'))) {
		assert.doesNotMatch(line, /\bcheck\b/, line)
	}
})

test('the glossary names the words not used in names and the naming rule with its three reasons', () => {
	const section = verbsSection(glossary)
	assert.match(section, /^- \*\*manage\*\* /m)
	assert.match(section, /^- \*\*validate\*\* /m)
	assert.match(section, /A standalone skill is named `<verb>-<plugin>`/)
	assert.match(section, /^1\. .*collides/m)
	assert.match(section, /^2\. .*repeats the plugin/m)
	assert.match(section, /^3\. .*Verb first/m)
	assert.match(section, /A command behind a router skill takes the bare verb/)
})

test('the page carries the section text, raised a heading level, and links back to the glossary', () => {
	const page = renderVerbsPage(glossary)
	assert.match(page, /^---\ntitle: Verbs and skill names\n/)
	assert.match(page, /^## Naming a skill that carries a verb$/m)
	assert.doesNotMatch(page, /^### /m)
	assert.ok(page.includes(verbsSection(glossary).split('\n').at(-1)), 'the section text is on the page unchanged')
	assert.match(
		page,
		/\[package glossary\]\(https:\/\/github\.com\/cyber-uni\/cyber-agentkit\/blob\/main\/packages\/cyber-agentkit\/\.agents\/spec\/glossary\.md\)/,
	)
})

test('the section ends at the next level-two heading', () => {
	assert.equal(verbsSection('# G\n\n## Verbs\n\n- **a** — b\n\n## Other\n\nx'), '- **a** — b')
})

test('a glossary with no Verbs section fails the page build', () => {
	assert.equal(verbsSection('# G\n\n- **a** — b'), undefined)
	assert.throws(() => renderVerbsPage('# G'), /no "## Verbs" section/)
})
