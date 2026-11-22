// The Customization section of a generated skill page: what each reference the skill loads controls, what
// ships for it, the implementations of each interface it uses, and how to change one. `customization`
// gathers the facts through the `cyber-agentkit` library; `customizationSection` renders them and is pure.

const docs = '/cyber-agentkit'
const referenceSkill = `${docs}/packages/cyber-agentkit/skills/reference/`
const tiers = `${docs}/concepts/reference-documents/#where-contributions-are-read-from`
const customizing = `${docs}/concepts/reference-documents/#customizing-a-reference`
const implementing = `${docs}/concepts/reference-interfaces/#implementing-an-interface`

const esc = (text) => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ')

/**
 * What a skill folder lets a reader customize, as `reference uses` reports it, in a fresh project where
 * only the skill's own plugin is installed. Each reference gets its description and, when it implements an
 * interface, that interface's implementations.
 *
 * @param lib the `cyber-agentkit` root entry
 * @param options.root an empty project folder (with a `.git` marker) and `home` an empty home folder, so
 *   nothing on this machine changes the answer
 */
export async function customization(lib, { skillDir, plugin, root, home }) {
	const layers = await lib.referenceLayers({
		root,
		cwd: root,
		home,
		platform: process.platform,
		plugin,
		defaultSkill: skillDir,
		env: {},
		harnesses: [],
	})
	const uses = lib.referenceUses(layers, { paths: [skillDir], cwd: skillDir })
	const implementationsOf = (id) => {
		try {
			const found = lib.referenceImplementations(id, layers)
			return { id, pins: found.implementations.map((i) => i.pin), inUse: found.inUse }
		} catch {
			return { id, pins: [] }
		}
	}
	const loads = (uses.loads ?? []).map((load) => {
		const resolved = lib.resolveReference(load.name, layers)
		const meta = resolved.metadata ?? {}
		const implemented = typeof meta.implements === 'string' ? meta.implements.split('@')[0] : undefined
		return {
			name: load.name,
			description: typeof meta.description === 'string' ? meta.description : undefined,
			found: load.status === 'found',
			bundledDefault: load.default,
			plugins: load.answeredBy.filter((tier) => tier.startsWith('plugin ')).map((tier) => tier.slice(7)),
			...(implemented ? { implements: implementationsOf(implemented) } : {}),
		}
	})
	return { loads, interfaces: (uses.interfaces ?? []).map(implementationsOf) }
}

function ships({ found, bundledDefault, plugins }) {
	if (bundledDefault) return 'A default bundled with the skill'
	if (plugins.length) return plugins.map((name) => `The \`${name}\` plugin`).join(', ')
	return found ? 'Nothing' : 'Nothing; the name answers only once you create it'
}

function implementationLine(subject, { id, pins, inUse }) {
	const listed = pins.length
		? pins.map((pin) => `\`${pin}\`${pin === inUse ? ' (in use)' : ''}`).join(', ')
		: 'none ships yet'
	return `- ${subject} the \`${id}\` interface. Implementations: ${listed}.`
}

/** The `## Customization` section, as Markdown lines. */
export function customizationSection({ loads, interfaces }) {
	const out = ['## Customization', '']
	if (!loads.length && !interfaces.length) {
		out.push('This skill loads no reference, so it has no customization points.', '')
		return out
	}
	out.push(
		'The skill reads each reference below by name. Change what one says for one repository or only for you, without forking the plugin: a contribution in the repo tier (`.agents/references/`) or the user tier (`~/.agents/references/`) builds on what ships. [Where contributions are read from](' +
			tiers +
			') lists every tier.',
		'',
	)
	if (loads.length) {
		out.push('| Reference | What it controls | What ships |', '| --- | --- | --- |')
		for (const load of loads)
			out.push(`| \`${load.name}\` | ${esc(load.description ?? 'No description.')} | ${ships(load)} |`)
		out.push('')
	}
	const chosen = [
		...loads
			.filter((load) => load.implements)
			.map((load) => implementationLine(`\`${load.name}\` implements`, load.implements)),
		...interfaces.map((found) => implementationLine('The skill loads every implementation of', found)),
	]
	if (chosen.length) {
		out.push('### Implementations', '')
		out.push(
			`An interface's implementation can be swapped. Pick another plugin's with \`reference customize <name> --extends <plugin>\`, or write your own with \`reference create <name> --implements <interface>\`. [Implementing an interface](${implementing}) gives the shape it must have.`,
			'',
			...chosen,
			'',
		)
	}
	const example = loads[0]?.name ?? '<name>'
	out.push(
		'### How to change one',
		'',
		`Ask the [\`reference\` skill](${referenceSkill}), as in "Change what \`${example}\` says for this repo." Or run the commands yourself:`,
		'',
		'```sh',
		`npx -y cyber-agentkit reference where ${example}`,
		`npx -y cyber-agentkit reference customize ${example} --base`,
		'```',
		'',
		`\`where\` names the repo and user files a change goes in. \`customize --base\` prints what a new body builds on; add \`--scope user\` to change it only for you. [Customizing a reference](${customizing}) covers the rest.`,
		'',
	)
	return out
}
