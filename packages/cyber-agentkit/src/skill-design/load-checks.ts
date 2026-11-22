import {
	backtickedNames,
	declaredInterfacesKey,
	declaredLoads,
	declaredReferencesKey,
	type KnownName,
	loadsIn,
	withoutFences,
} from '../references/reference-loads.js'
import type { CheckOutcome } from './skill-check-types.js'
import { readText, type SkillFiles } from './skill-files.js'

/** The Markdown an agent reads, by file: the `SKILL.md` body and every `.md` under `references/`, fences taken out. */
function agentTexts(skill: SkillFiles): { file: string; text: string }[] {
	const texts = [{ file: 'SKILL.md', text: withoutFences(skill.body) }]
	for (const file of skill.files)
		if (file.startsWith('references/') && file.endsWith('.md') && !/\.default\.md$/.test(file)) {
			const text = readText(skill, file)
			if (text !== undefined) texts.push({ file, text: withoutFences(text) })
		}
	return texts
}

/**
 * The names listed in bullets under a load lead-in that names none itself, such as "Load these with the
 * `reference` skill:" followed by "- `project-tracker.levels`: …". The form a declared list replaces.
 */
export function leadInNames(text: string): string[] {
	const lines = text.split('\n')
	const names: string[] = []
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] as string
		if (!/\bLoad\b/.test(line) || !line.includes('with the `reference` skill')) continue
		const named = loadsIn(line)
		if (named.names.length || named.interfaces.length) continue
		let next = index + 1
		while (next < lines.length && (lines[next] as string).trim() === '') next++
		for (; next < lines.length; next++) {
			const item = /^\s*(?:[-*+]|\d+[.)])\s+`([^`]+)`/.exec(lines[next] as string)
			if (!item) break
			names.push(item[1] as string)
		}
	}
	return names
}

/**
 * SHP-20: the skill declares the references it loads under `metadata.references`, and the interfaces whose
 * implementations it loads under `metadata.reference-interfaces`, each one string of names separated by spaces.
 * It fails on a load the skill does not declare (a backticked name `known` resolves, an English load line, or a
 * name listed under a lead-in), on a declared name the text never mentions in backticks, and on a value that is
 * not a string. Without `known`, a backticked name counts only on a load line or under a lead-in.
 */
export function checkLoads(skill: SkillFiles, known?: KnownName): CheckOutcome {
	const problems: { file: string; message: string }[] = []
	const metadata = skill.frontmatter?.['metadata']
	const record = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : undefined
	for (const key of [declaredReferencesKey, declaredInterfacesKey]) {
		const value = (record as Record<string, unknown> | undefined)?.[key]
		if (value !== undefined && typeof value !== 'string')
			problems.push({
				file: 'SKILL.md',
				message: `\`metadata.${key}\` is not a string; the Agent Skills spec makes each \`metadata\` value a string, so list the names separated by spaces`,
			})
	}
	const declared = declaredLoads(skill.frontmatter)
	const names = new Set(declared?.names ?? [])
	const interfaces = new Set(declared?.interfaces ?? [])
	const how = declared
		? `add it to \`metadata.${declaredReferencesKey}\``
		: `declare the skill's loads under \`metadata.${declaredReferencesKey}\` in the front matter`
	const mentioned = new Set<string>()
	const reported = new Set<string>()
	const undeclared = (file: string, name: string, why: string, list = declaredReferencesKey) => {
		if (reported.has(name)) return
		reported.add(name)
		const fix = list === declaredReferencesKey ? how : how.replace(declaredReferencesKey, list)
		problems.push({ file, message: `${file} ${why} \`${name}\`, which the skill does not declare; ${fix}` })
	}
	for (const { file, text } of agentTexts(skill)) {
		for (const name of backtickedNames(text)) mentioned.add(name)
		const lines = loadsIn(text)
		for (const name of lines.names) if (!names.has(name) && !interfaces.has(name)) undeclared(file, name, 'loads')
		for (const id of lines.interfaces)
			if (!interfaces.has(id)) undeclared(file, id, 'loads the implementations of', declaredInterfacesKey)
		for (const name of leadInNames(text)) if (!names.has(name)) undeclared(file, name, 'lists under a load lead-in')
		if (known)
			for (const name of backtickedNames(text)) {
				if (names.has(name) || interfaces.has(name)) continue
				const kind = known(name)
				if (kind === 'reference') undeclared(file, name, 'names the reference')
				else if (kind === 'interface') undeclared(file, name, 'names the interface', declaredInterfacesKey)
			}
	}
	for (const name of [...names, ...interfaces])
		if (!mentioned.has(name))
			problems.push({
				file: 'SKILL.md',
				message: `the skill declares \`${name}\`, and no text the agent reads mentions it in backticks; say where it is loaded, or take it out of the list`,
			})
	return problems.length
		? {
				id: 'SHP-20',
				status: 'fail',
				message: problems.map(({ message }) => message).join('; '),
				file: problems[0]?.file,
			}
		: { id: 'SHP-20', status: 'pass' }
}
