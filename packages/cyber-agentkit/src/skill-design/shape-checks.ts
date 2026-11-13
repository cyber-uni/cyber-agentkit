import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CheckOutcome } from './skill-check-types.js'
import { readText, type SkillFiles } from './skill-files.js'
import { headingAnchors, inOwnFolder, isExternal, linkTargets, plainPaths, resolveIn } from './skill-text.js'

type Visit = { text: string; from: string; file: string }

/** SHP-1 and SHP-2, the Shape checks a script decides from what the body links and names. */
export function checkShape(skill: SkillFiles): CheckOutcome[] {
	const lines = skill.body.split('\n').length
	const outcomes: CheckOutcome[] = [
		lines <= 500
			? { id: 'SHP-1', status: 'pass' }
			: { id: 'SHP-1', status: 'fail', message: `the body is ${lines} lines`, file: 'SKILL.md' },
	]
	const broken: { file: string; message: string }[] = []
	const reached = new Set<string>()
	const anchorsOf = new Map<string, Set<string>>([['SKILL.md', headingAnchors(skill.body)]])
	const anchors = (file: string): Set<string> | undefined => {
		if (!anchorsOf.has(file)) {
			const text = skill.files.includes(file) ? readText(skill, file) : undefined
			if (text === undefined) return undefined
			anchorsOf.set(file, headingAnchors(text))
		}
		return anchorsOf.get(file)
	}
	const queue: Visit[] = [{ text: skill.body, from: '.', file: 'SKILL.md' }]
	while (queue.length) {
		const { text, from, file } = queue.shift() as Visit
		for (const written of linkTargets(text)) {
			if (isExternal(written)) continue
			const [path = '', anchor] = written.split('#') as [string, string | undefined]
			const target = path ? resolveIn(from, decodeURI(path)) : file
			if (path && !existsSync(join(skill.folder, target))) {
				broken.push({ file, message: `${file} links ${target}, which does not exist` })
				continue
			}
			if (anchor && target.endsWith('.md')) {
				const found = anchors(target)
				if (found && !found.has(decodeURI(anchor).toLowerCase()))
					broken.push({ file, message: `${file} links ${target}#${anchor}, a heading that does not exist` })
			}
			if (!path || reached.has(target)) continue
			reached.add(target)
			if (target.endsWith('.md') && skill.files.includes(target)) {
				const linked = readText(skill, target)
				if (linked !== undefined) queue.push({ text: linked, from: dirname(target), file: target })
			}
		}
		for (const path of new Set(plainPaths(text))) {
			if (!inOwnFolder(path)) continue
			const named = [resolveIn('.', path), resolveIn(from, path)]
			if (!named.some((target) => existsSync(join(skill.folder, target))))
				broken.push({ file, message: `${file} names ${path}, which does not exist` })
		}
	}
	const unlinked = skill.files.filter(
		(file) => file.startsWith('references/') && !file.endsWith('.default.md') && !reached.has(file),
	)
	const problems = [
		...broken.map((item) => item.message),
		...unlinked.map((file) => `${file} is not linked from SKILL.md or a file it links`),
	]
	outcomes.push(
		problems.length
			? { id: 'SHP-2', status: 'fail', message: problems.join('; '), file: broken[0]?.file ?? unlinked[0] }
			: { id: 'SHP-2', status: 'pass' },
	)
	return outcomes
}
