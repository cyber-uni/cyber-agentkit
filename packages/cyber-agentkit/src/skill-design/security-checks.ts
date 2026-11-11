import type { CheckOutcome } from './skill-check-types.js'
import { readText, type SkillFiles } from './skill-files.js'

/** Shapes of common secrets. A match is reported by kind only, never with the value. */
const secrets: { kind: string; pattern: RegExp }[] = [
	{ kind: 'a private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ kind: 'an AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
	{ kind: 'a GitHub token', pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
	{ kind: 'an Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
	{ kind: 'an OpenAI API key', pattern: /\bsk-(proj-)?[A-Za-z0-9]{32,}\b/ },
	{ kind: 'a Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
	{ kind: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
	{ kind: 'an npm token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
]

const downloadAndRun = [
	/\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/,
	/\b(iex|Invoke-Expression)\s*\(\s*(irm|iwr|Invoke-RestMethod|Invoke-WebRequest|\(?New-Object)\b/i,
	/\b(irm|iwr)\b[^\n|]*\|\s*iex\b/i,
]

/** SEC-1 and SEC-2, the default Security aspect's script checks. */
export function checkSecurity(skill: SkillFiles): CheckOutcome[] {
	const found: { file: string; message: string }[] = []
	const runs: { file: string; message: string }[] = []
	for (const file of skill.files) {
		const text = readText(skill, file)
		if (text === undefined) continue
		for (const { kind, pattern } of secrets)
			if (pattern.test(text)) found.push({ file, message: `${file} holds ${kind}` })
		const lines = text.split('\n')
		lines.forEach((line, index) => {
			if (downloadAndRun.some((pattern) => pattern.test(line)))
				runs.push({ file, message: `${file}:${index + 1} downloads code and runs it` })
		})
	}
	const outcome = (id: string, list: { file: string; message: string }[]): CheckOutcome =>
		list.length
			? {
					id,
					status: 'fail',
					message: list.map((item) => item.message).join('; '),
					file: (list[0] as { file: string }).file,
				}
			: { id, status: 'pass' }
	return [outcome('SEC-1', found), outcome('SEC-2', runs)]
}
