// Renders the documentation site's Verbs page from the `## Verbs` section of the package glossary, so the
// verbs have one home: the glossary. The page is generated, never edited.

const sourceUrl =
	'https://github.com/cyber-uni/cyber-agentkit/blob/main/packages/cyber-agentkit/.agents/spec/glossary.md'

/** The text under `## Verbs`, up to the next `## ` heading, or undefined when the glossary has none. */
export function verbsSection(glossary) {
	const lines = glossary.split('\n')
	const start = lines.findIndex((line) => line.trim() === '## Verbs')
	if (start === -1) return undefined
	const rest = lines.slice(start + 1)
	const end = rest.findIndex((line) => /^## /.test(line))
	return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
}

/** The page: the section's text with its `###` headings raised to `##`, under a title and a source note. */
export function renderVerbsPage(glossary) {
	const body = verbsSection(glossary)
	if (body === undefined)
		throw new Error('The package glossary has no "## Verbs" section to build the Verbs page from.')
	const raised = body.replace(/^### /gm, '## ')
	return [
		'---',
		'title: Verbs and skill names',
		'description: What each common verb in a skill or command name means, the words not used in names, and how a skill that carries a verb is named.',
		'---',
		'',
		`<!-- Generated from the package glossary (${sourceUrl}). Edit the glossary, not this page. -->`,
		'',
		raised,
		'',
		`This page is generated from the [package glossary](${sourceUrl}).`,
		'',
	].join('\n')
}
