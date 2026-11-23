import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { backtickedNames, declaredLoads, loadsIn, withoutFences } from '../references/reference-loads.js'
import { readEvalSuite, rootScope, suiteCases } from './eval-suite.js'
import { isBuiltScript, names, reachOf, splitBody, splitSections } from './input-hashes.js'
import type { CheckOutcome } from './skill-check-types.js'
import type { SkillFiles } from './skill-files.js'
import { inOwnFolder, isExternal, leavesFolder, linkTargets, plainPaths, resolveIn } from './skill-text.js'

/** One shared input some parts do not use: what it is, the parts that use it, and the cases an edit to it re-runs. */
export type SharedInput = { what: string; users: string[]; parts: number; cases: number }

/**
 * The inputs the shared sections of `SKILL.md` give every eval scope that the parts' own instructions use in fewer
 * than all of them (#417): a file the shared text links or names, and a section of a named reference it names. An edit
 * to one stales every scope, though the parts that do not use it never read it. `resolve` gives the content of a named
 * reference; without it, named references are not read. Empty when the skill has fewer than two parts.
 */
export function sharedInputs(skill: SkillFiles, resolve?: (name: string) => string | undefined): SharedInput[] {
	const suite = readEvalSuite(skill.folder)
	if ('problem' in suite || suite.folders.length < 2) return []
	const { shared, rows } = splitBody(skill.body)
	const declared = new Set(declaredLoads(skill.frontmatter)?.names ?? [])
	const scoped = suiteCases(suite, join(skill.folder, 'evals')).filter(
		(item) => item.scope === rootScope || suite.folders.some((folder) => folder.name === item.scope),
	)
	// What a part's own instructions reach and say, without the shared sections.
	const parts = suite.folders.map((folder) => {
		const instructions = `references/${folder.name}.md`
		const reach = reachOf(
			skill,
			[
				{ text: (rows[folder.name] ?? []).join('\n'), from: '.' },
				{ text: `[${folder.name}](${instructions})`, from: '.' },
			],
			declared,
		)
		const text = [
			...(rows[folder.name] ?? []),
			...reach.files
				.filter((path) => /\.mdx?$/i.test(path))
				.map((path) => readFileSync(join(skill.folder, path), 'utf8')),
		].join('\n')
		return { name: folder.name, reach, text }
	})
	const found: SharedInput[] = []
	const record = (what: string, uses: (part: (typeof parts)[number]) => boolean) => {
		const users = parts.filter(uses).map((part) => part.name)
		if (users.length < parts.length) found.push({ what, users, parts: parts.length, cases: scoped.length })
	}
	const known = new Set(skill.files)
	const linked = new Set<string>()
	const direct = (path: string) => {
		if (!known.has(path) || path === 'SKILL.md' || path.startsWith('evals/') || isBuiltScript(path)) return
		linked.add(path)
	}
	for (const target of linkTargets(shared)) {
		if (isExternal(target)) continue
		const path = resolveIn('.', target.split('#')[0] as string)
		if (path && !leavesFolder(path)) direct(path)
	}
	for (const path of plainPaths(shared))
		if (inOwnFolder(path)) {
			const target = resolveIn('.', path)
			if (!leavesFolder(target)) direct(target)
		}
	for (const path of [...linked].sort()) record(path, (part) => part.reach.files.includes(path))
	if (resolve) {
		const bare = withoutFences(shared)
		const named = new Set(loadsIn(bare).names)
		for (const name of backtickedNames(bare)) if (declared.has(name)) named.add(name)
		for (const name of [...named].sort()) {
			const content = resolve(name)
			if (content === undefined) continue
			const { sections } = splitSections(content)
			for (const section of sections)
				if (names(shared, section.heading))
					record(`the "${section.heading}" section of the \`${name}\` reference`, (part) =>
						names(part.text, section.heading),
					)
		}
	}
	return found
}

const list = (items: string[]) => (items.length ? items.join(', ') : 'no part')

/**
 * SHP-22 (#417), a warning: the shared sections of `SKILL.md` link a file, or name a reference section, that the parts'
 * own instructions use in fewer than all of them, so one edit to it stales every eval scope. It names the input, the
 * parts that use it, and how many cases an edit re-runs. It never hides a dependency: only the author can tell text
 * every part needs from text one part does, so it warns and the author moves the text or the link.
 */
export function checkSharedSections(skill: SkillFiles, resolve?: (name: string) => string | undefined): CheckOutcome {
	const inputs = sharedInputs(skill, resolve)
	if (!inputs.length) return { id: 'SHP-22', status: 'pass' }
	return {
		id: 'SHP-22',
		status: 'fail',
		message: inputs
			.map(
				(input) =>
					`the shared sections of SKILL.md use ${input.what}, which only ${list(input.users)} use (${input.users.length} of ${input.parts} parts), so one edit to it re-runs all ${input.cases} cases; move the text or the link into the parts that use it`,
			)
			.join('; '),
		file: 'SKILL.md',
	}
}
