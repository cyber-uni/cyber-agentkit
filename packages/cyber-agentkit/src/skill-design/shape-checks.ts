import { existsSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import type { CheckOutcome } from './skill-check-types.js'
import { readText, type SkillFiles } from './skill-files.js'

const link = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

/** The local files a Markdown text links, resolved against the folder `from` (relative to the skill). */
function localLinks(text: string, from: string): string[] {
	const targets: string[] = []
	const unfenced = text.replace(/```[\s\S]*?```/g, '')
	for (const match of unfenced.matchAll(link)) {
		const target = (match[1] as string).split('#')[0] as string
		if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue
		targets.push(
			normalize(join(from, decodeURI(target)))
				.split('\\')
				.join('/'),
		)
	}
	return targets
}

/** SHP-1 and SHP-2, the Shape checks a script decides. */
export function checkShape(skill: SkillFiles): CheckOutcome[] {
	const lines = skill.body.split('\n').length
	const outcomes: CheckOutcome[] = [
		lines <= 500
			? { id: 'SHP-1', status: 'pass' }
			: { id: 'SHP-1', status: 'fail', message: `the body is ${lines} lines`, file: 'SKILL.md' },
	]
	const broken: string[] = []
	const reached = new Set<string>()
	const queue: { text: string; from: string; file: string }[] = [{ text: skill.body, from: '.', file: 'SKILL.md' }]
	while (queue.length) {
		const { text, from, file } = queue.shift() as { text: string; from: string; file: string }
		for (const target of localLinks(text, from)) {
			if (reached.has(target)) continue
			if (!existsSync(join(skill.folder, target))) {
				broken.push(`${file} links ${target}, which does not exist`)
				continue
			}
			reached.add(target)
			if (target.endsWith('.md') && skill.files.includes(target)) {
				const linked = readText(skill, target)
				if (linked !== undefined) queue.push({ text: linked, from: dirname(target), file: target })
			}
		}
	}
	const unlinked = skill.files.filter(
		(file) => file.startsWith('references/') && !file.endsWith('.default.md') && !reached.has(file),
	)
	const problems = [...broken, ...unlinked.map((file) => `${file} is not linked from SKILL.md or a file it links`)]
	outcomes.push(
		problems.length
			? { id: 'SHP-2', status: 'fail', message: problems.join('; '), file: broken.length ? 'SKILL.md' : unlinked[0] }
			: { id: 'SHP-2', status: 'pass' },
	)
	return outcomes
}
