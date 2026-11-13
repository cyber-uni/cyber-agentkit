import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CheckOutcome } from './skill-check-types.js'
import { readText, type SkillFiles } from './skill-files.js'
import { headingAnchors, inOwnFolder, isExternal, linkTargets, plainPaths, resolveIn } from './skill-text.js'

type Visit = { text: string; from: string; file: string }

/** The most lines, and the most tokens by estimate, SHP-1 allows in the `SKILL.md` body. */
const maxLines = 500
const maxTokens = 5000

/** A token estimate for English prose and Markdown: about four characters a token. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

/** SHP-1 and SHP-2, the Shape checks a script decides from what the body links and names. */
export function checkShape(skill: SkillFiles): CheckOutcome[] {
	const lines = skill.body.split('\n').length
	const tokens = estimateTokens(skill.body)
	const over = [
		...(lines > maxLines ? [`the body is ${lines} lines`] : []),
		...(tokens > maxTokens ? [`the body is about ${tokens} tokens`] : []),
	]
	const outcomes: CheckOutcome[] = [
		over.length
			? { id: 'SHP-1', status: 'fail', message: over.join('; '), file: 'SKILL.md' }
			: { id: 'SHP-1', status: 'pass' },
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

/** The Markdown an agent reads: the `SKILL.md` body and every `.md` under `references/`, outside code fences. */
function agentMarkdown(skill: SkillFiles): { file: string; lines: string[] }[] {
	const texts = [{ file: 'SKILL.md', text: skill.body }]
	for (const file of skill.files)
		if (file.startsWith('references/') && file.endsWith('.md')) {
			const text = readText(skill, file)
			if (text !== undefined) texts.push({ file, text })
		}
	return texts.map(({ file, text }) => {
		let fenced = false
		const lines = text.split('\n').map((line) => {
			if (/^\s*(```|~~~)/.test(line)) {
				fenced = !fenced
				return ''
			}
			return fenced ? '' : line
		})
		return { file, lines }
	})
}

/** A line telling the agent to read a script's output as text it must pick apart. */
const parsesOutput = [
	/\b(parse|scrape|grep|extract [\w\s]{0,20}? from)\s+(the\s+|its\s+)?(script'?s?\s+|command'?s?\s+)?(output|stdout)\b/i,
	/\bfrom\s+(the\s+)?script'?s?\s+(output|stdout)\b/i,
	/\bread\s+(the\s+)?(summary\s+)?table\s+(it|the script)\s+prints\b/i,
]

/** A script that waits for the user to type an answer. */
const prompts =
	/\breadline\b|\bcreateInterface\s*\(|\.question\s*\(|\bread\s+(-r\s+)?-p\b|\bRead-Host\b|\binquirer\b|@clack\/prompts|\benquirer\b|\bprompts\s*\(|^\s*\w+\s*=\s*input\s*\(/m

/** SHP-12, SHP-13, and SHP-14, the Shape checks a script decides on the body and its scripts. */
export function checkShapeBody(skill: SkillFiles): CheckOutcome[] {
	const markdown = agentMarkdown(skill)
	const body = (markdown[0] as { lines: string[] }).lines
	const steps = body.some((line) => /^\s*\d+[.)]\s+\S/.test(line) || /^#{2,6}\s+\S/.test(line))
	const outcomes: CheckOutcome[] = [
		steps
			? { id: 'SHP-12', status: 'pass' }
			: {
					id: 'SHP-12',
					status: 'fail',
					message: 'the body has no numbered steps and no `##` sections',
					file: 'SKILL.md',
				},
	]
	const scripts = skill.files.filter((file) => file.startsWith('scripts/'))
	const parses: { file: string; message: string }[] = []
	if (scripts.length)
		for (const { file, lines } of markdown)
			lines.forEach((line, index) => {
				if (/\bjson\b/i.test(line)) return
				if (parsesOutput.some((pattern) => pattern.test(line)))
					parses.push({ file, message: `${file}:${index + 1} tells the agent to parse a script's output` })
			})
	outcomes.push(
		parses.length
			? {
					id: 'SHP-13',
					status: 'fail',
					message: parses.map((item) => item.message).join('; '),
					file: (parses[0] as { file: string }).file,
				}
			: { id: 'SHP-13', status: 'pass' },
	)
	const documented = markdown.some(({ lines }) => lines.some((line) => line.includes('--yes')))
	const asking: { file: string; message: string }[] = []
	for (const file of scripts) {
		const text = readText(skill, file)
		if (text === undefined || !prompts.test(text)) continue
		if (!text.includes('--yes')) asking.push({ file, message: `${file} prompts the user and has no \`--yes\` flag` })
		else if (!documented)
			asking.push({ file, message: `${file} prompts the user, and no Markdown the agent reads documents \`--yes\`` })
	}
	outcomes.push(
		asking.length
			? {
					id: 'SHP-14',
					status: 'fail',
					message: asking.map((item) => item.message).join('; '),
					file: (asking[0] as { file: string }).file,
				}
			: { id: 'SHP-14', status: 'pass' },
	)
	return outcomes
}
