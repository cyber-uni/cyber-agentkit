import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The skill's criteria are behavior of its text, which no unit test reaches (spec C5). These fixture
// checks confirm the text holds each instruction.

const files = ['SKILL.md', 'README.md', 'references/load.md', 'references/create.md', 'references/customize.md']

/** A file of the `reference` skill, with each run of whitespace made one space so a wrapped line still matches. */
function skillText(path: string): string {
	return readFileSync(new URL(`../../skills/reference/${path}`, import.meta.url), 'utf8').replace(/\s+/g, ' ')
}

const load = skillText('references/load.md')
const create = skillText('references/create.md')
const customize = skillText('references/customize.md')
const skill = skillText('SKILL.md')

/** The text of `text` from the heading `## <title>` to the next `## ` heading. */
function section(text: string, title: string): string {
	const start = text.indexOf(`## ${title}`)
	expect(start, `section "${title}"`).toBeGreaterThanOrEqual(0)
	const end = text.indexOf(' ## ', start + 3)
	return text.slice(start, end < 0 ? undefined : end)
}

describe('the reference skill text', () => {
	it('reads its own default only when the command did not run, never for a name it reported (R21)', () => {
		const fallback = section(load, '4. When the command did not run')
		expect(fallback).toContain("Read the caller's default of every name, and only then.")
		expect(fallback).toContain('Never read a default for a name the command reported, whatever its status.')
		expect(fallback).toContain('`references/<name>.default.md`')
		expect(fallback).toContain(
			'`references/<name>.default.json`, `.default.yaml`, `.default.yml`, `.default.toml`, then `.default.txt`',
		)
		expect(fallback).toContain('Never read `references/<name>.md`; it is not a default.')
		expect(load).toContain("Do not read the caller's default or search for a substitute")
	})

	it('reports every fallback and every name not loaded, except one a remove turned off (R22)', () => {
		const report = section(load, '5. Report')
		expect(report).toContain('each name not loaded, and why')
		expect(report).toContain('Leave out a name a `remove` turned off.')
		expect(report).toContain("each name came from the caller's default")
		expect(report).toContain('Say nothing about the load when every name was found with no warning.')
		expect(load).toContain('`reference-removed`: a `remove` turned the name off on purpose.')
		expect(load).toContain('say nothing about it. It is not a fault.')
	})

	it('never reads the path an invalid name gives (R23)', () => {
		expect(load).toContain('**invalid** with `reference-invalid`')
		expect(load).toContain('Never read the path or file it names.')
		expect(load).toContain("a fault in the caller's instructions, to report to the caller's author")
	})

	it('lists every ambiguous option, asks for a pick and a scope, and writes it with customize --extends (R59)', () => {
		expect(load).toContain('list every option, including `default`, even when only one is left')
		expect(load).toContain('whether the pick is for the repository (the default) or only for them')
		expect(load).toContain('`reference customize <name> --extends <step>`')
		expect(load).toContain("the option's plugin part or `default`")
		expect(load).toContain('`--scope user` when it is for them only')
		expect(load).toContain('run step 1 again for that name alone')
		expect(load).toContain('With no user present, carry on without it, and tell the user to settle it')
	})

	it('writes a customization only after approval, never with no user, and revises in order (R85)', () => {
		expect(customize).toContain('With no user present, write nothing.')
		expect(customize).toContain('Show the customizer the path and the draft. If they decline, write nothing.')
		expect(customize).toContain('Only after they approve, run the same command without `--dry-run`.')
		expect(customize).toContain('`customize <name> --base`')
		expect(customize).toContain('`customize <name> --request <request file> --body <draft file> --dry-run`')
		expect(customize).toContain('Never add text from anywhere else, such as managed or admin instructions')
		expect(customize).toContain('Tell the customizer before you generate anything.')
		expect(customize).toContain('Revise the main document first')
		expect(customize).toContain('Then revise each stale project section')
		expect(customize).toContain('Spawn a generator subagent.')
	})

	it('passes every warning on, one line each, and a stale one with its plugins and Customize mode (R88)', () => {
		expect(load).toContain('Pass every warning on to the user, one line each')
		expect(load).toContain('A `reference-stale` warning')
		expect(load).toContain('name the changed plugins')
		expect(load).toContain('Customize mode revises the document from its recorded request')
	})

	it('gives a load line naming the references and the skill of its package, or an interface (R89)', () => {
		const wire = section(skill, 'Wire a skill')
		expect(wire).toContain('Load `<name>` and `<name>` with the `reference` skill of `cyber-agentkit`.')
		expect(wire).toContain(
			'Load the implementations of the `<id>` interface with the `reference` skill of `cyber-agentkit`.',
		)
		expect(wire).toContain("may add that harness's typed form")
		expect(load).toContain('load <name>... --default <caller folder>')
		expect(load).toContain('Add `--root <repository root>` only when the working folder is not in the repository')
	})

	it('states the order to follow where instructions conflict, project sections included (R90)', () => {
		const follow = section(load, '6. Follow the references')
		const order = [
			'company and team instructions',
			"a single feature's own document",
			'the resolved reference, or the default read when the command did not run',
		].map((phrase) => follow.indexOf(phrase))
		expect(order.every((at) => at >= 0)).toBe(true)
		expect(order).toEqual([...order].sort((a, b) => a - b))
		expect(follow).toContain('the project section for the folder the work is in ranks over the main document')
		expect(follow).toContain("the inner folder's section wins where they conflict")
	})

	it('follows a project section from the moment the work moves into its folder, without loading again (R91)', () => {
		const follow = section(load, '6. Follow the references')
		expect(follow).toContain('Follow a project section whenever your work is in its folder.')
		expect(follow).toContain("follow that folder's project section from then on, without loading again")
	})

	it('shows where each section came from and offers the full document after a create (R107)', () => {
		const result = section(create, '6. Show the result')
		expect(result).toContain('Show the author where each section came from')
		expect(result).toContain('Offer the full document.')
	})

	it('says no customization applied when the command did not run (UC4.4)', () => {
		const report = section(load, '5. Report')
		expect(report).toContain('when the command did not run: that it did not, the error it gave')
		expect(report).toContain('no managed text, project section, or repository or user customization applied')
		expect(section(load, '4. When the command did not run')).toContain('A name with no such file is not loaded.')
	})

	it("loads without the default tier and tells the user when the caller's folder is unknown (UC12.3)", () => {
		expect(load).toContain("When you cannot tell the caller's folder, leave out `--default`.")
		expect(section(load, '5. Report')).toContain(
			"when you could not tell the caller's folder: that the names loaded without its defaults",
		)
	})

	it.each(files)('%s names no removed command or scope', (path) => {
		const text = skillText(path)
		expect(text).not.toContain('reference show')
		expect(text).not.toContain('reference select')
		expect(text).not.toContain('--scope project')
		expect(text).not.toMatch(/\bshow <name>|\bselect <name>/)
	})
})
