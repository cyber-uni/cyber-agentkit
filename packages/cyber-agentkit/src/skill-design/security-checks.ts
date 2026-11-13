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

/**
 * Code points that render as nothing, or reorder the text around them, so a reader cannot see what the agent
 * reads. Written as escapes so this file and the script built from it hold none of them.
 */
const invisible = new Map<number, string>([
	[0x00ad, 'soft hyphen'],
	[0x034f, 'combining grapheme joiner'],
	[0x061c, 'Arabic letter mark'],
	[0x180e, 'Mongolian vowel separator'],
	[0x200b, 'zero width space'],
	[0x200c, 'zero width non-joiner'],
	[0x200d, 'zero width joiner'],
	[0x200e, 'left-to-right mark'],
	[0x200f, 'right-to-left mark'],
	[0x202a, 'left-to-right embedding'],
	[0x202b, 'right-to-left embedding'],
	[0x202c, 'pop directional formatting'],
	[0x202d, 'left-to-right override'],
	[0x202e, 'right-to-left override'],
	[0x2060, 'word joiner'],
	[0x2061, 'function application'],
	[0x2062, 'invisible times'],
	[0x2063, 'invisible separator'],
	[0x2064, 'invisible plus'],
	[0x2066, 'left-to-right isolate'],
	[0x2067, 'right-to-left isolate'],
	[0x2068, 'first strong isolate'],
	[0x2069, 'pop directional isolate'],
	[0xfeff, 'zero width no-break space'],
])
const isTag = (code: number) => code >= 0xe0000 && code <= 0xe007f
const pictographic = /^(\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\uFE0F)$/u
/** A bundled script whose minifier keeps a byte-order mark inside a string, as the bundled `yaml` does. */
const code = /\.(m|c)?js$/

/** Every invisible code point in `text`, as `<line>:<column> U+<hex> (<name>)`, columns counted in code points. */
function invisibleIn(file: string, text: string): string[] {
	const found: string[] = []
	text.split('\n').forEach((line, index) => {
		const chars = Array.from(line)
		chars.forEach((char, column) => {
			const point = char.codePointAt(0) as number
			const name = invisible.get(point) ?? (isTag(point) ? 'tag character' : undefined)
			if (!name) return
			if (point === 0xfeff && ((index === 0 && column === 0) || code.test(file))) return
			// A joiner between two emoji builds one emoji, such as a family; it hides nothing.
			if (point === 0x200d && pictographic.test(chars[column - 1] ?? '') && pictographic.test(chars[column + 1] ?? ''))
				return
			const hex = point.toString(16).toUpperCase().padStart(4, '0')
			found.push(`${file}:${index + 1}:${column + 1} U+${hex} (${name})`)
		})
	})
	return found
}

/** A path that reaches far beyond what one task owns: the root, the home folder, every file, or the parent. */
const broadPath = String.raw`(\/|\/\*|~\/?|~\/\*|\$\{?HOME\}?\/?|\$\{?HOME\}?\/\*|\*|\.\.?\/?|\.\.\/\*)(?=$|[\s;&|)"'\x60])`
const destructive = [
	new RegExp(String.raw`\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*(r[a-zA-Z]*f|f[a-zA-Z]*r)[a-zA-Z]*\s+(--\s+)?${broadPath}`),
	new RegExp(String.raw`\brm\s+(-[a-zA-Z]+\s+)*--recursive\s+--force\s+${broadPath}`),
	/\bdd\b[^\n]*\bof=\/dev\/(sd|hd|nvme|disk|mmcblk|xvd|vd)/,
	/\bmkfs(\.[a-z0-9]+)?\s/,
	/:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
	/>\s*\/dev\/(sd[a-z]|hd[a-z]|nvme\d|disk\d)/,
	new RegExp(String.raw`\bchmod\s+(-[a-zA-Z]*R[a-zA-Z]*\s+)?(0?777|a\+rwx)\s+${broadPath}`),
	/\bRemove-Item\b[^\n]*-Recurse\b[^\n]*\s(C:\\|\$env:USERPROFILE|~)(\\|\s|$)/i,
	/\bformat\s+[a-z]:(\s|$)/i,
]

/** Phrases that tell a model to drop what it was told, and the delimiters of chat templates. */
const injection = [
	/\b(ignore|disregard|forget|override)\s+(all\s+|any\s+|the\s+|your\s+)*(previous|prior|above|earlier|preceding|system)\s+(instructions|prompts?|rules|directions|messages)\b/i,
	/\byou\s+are\s+now\s+(in\s+)?(DAN|developer\s+mode|jailbroken|unrestricted|no\s+longer\b)/i,
	/\b(new|updated|real)\s+system\s+prompt\s*:/i,
	/\bdo\s+not\s+(tell|inform|alert)\s+the\s+user\b/i,
	/<\|(im_start|im_end|im_sep|system|user|assistant|endoftext|eot_id|start_header_id|end_header_id|begin_of_text)\|>/i,
	/\[\/?INST\]|<<\/?SYS>>/,
	/<\/?(start_of_turn|end_of_turn)>/,
]

/**
 * Files that hold credentials: keys, cloud logins, registry tokens, and the system's password hashes. A bare word
 * is split with a character class, such as `vault[c]md`, so the built script does not match its own source.
 */
const credentials = [
	/(~|\$\{?HOME\}?|\/home\/[^/\s]+|\/Users\/[^/\s]+|\/root)\/\.(ssh|aws|gnupg|azure|kube|docker\/config\.json|netrc|npmrc|pypirc|git-credentials|config\/gcloud|config\/gh\/hosts\.yml)\b/,
	/\/etc\/(shadow|gshadow|sudoers|master\.passwd)\b/,
	/\bsecurity\s+(find-generic-password|find-internet-password|dump-keychain|export)\b/,
	/\b(Get-Stored[C]redential|cmdkey\s+\/list|vault[c]md)\b/i,
	/\bsecret-tool\s+lookup\b/,
	/%APPDATA%\\Microsoft\\(Credentials|Protect)|Login[ ]Data\b/i,
]

const url = /\bhttps?:\/\/[^\s"'`)<>]+/
/** A command that sends data, so a literal URL on its line is where the data goes. */
const sends = [
	/\bcurl\b[^\n]*\s(-d|--data[a-z-]*|-F|--form|-T|--upload-file|-X\s*(POST|PUT|PATCH)|--request\s+(POST|PUT|PATCH))(\s|=|$)/,
	/\bwget\b[^\n]*\s--(post|body)-(data|file)\b/,
	/\b(Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b[^\n]*-Method\s+(Post|Put|Patch)\b/i,
	/\bfetch\s*\([^\n]*\bmethod\s*:\s*['"`](POST|PUT|PATCH)['"`]/i,
	/\b(requests|httpx|axios)\.(post|put|patch)\s*\(/,
]
/** An endpoint no shipped skill needs to name: a bare public IP, or a service that collects what is sent to it. */
const endpoints = [
	/\bhttps?:\/\/(?!(127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))\d{1,3}(\.\d{1,3}){3}\b/,
	/\bhttps?:\/\/([a-z0-9-]+\.)*(webhook\.site|requestbin\.(com|net)|pipedream\.net|ngrok(-free)?\.(io|app|dev)|pastebin\.com|transfer\.sh|interact\.sh|oast\.(fun|me|pro|live|site|online)|burpcollaborator\.net)\b/i,
	/\bhttps?:\/\/(discord(app)?\.com\/api\/webhooks|hooks\.slack\.com\/services)\//i,
	/\/dev\/tcp\/[^/\s]+\/\d+/,
	/\b(nc|ncat|netcat)\s+(-[a-z]+\s+)*[a-z0-9.-]+\.[a-z]{2,}\s+\d{2,5}\b/i,
]

/** A flag or command that skips a safeguard: the commit hooks, a non-fast-forward refusal, or the user's privileges. */
const bypasses = [
	{ what: 'skips the commit hooks', pattern: /(^|\s)--no-verify\b/ },
	{
		what: 'forces a git command past its safeguard',
		pattern: /\bgit\s+[^\n]*\s(--force(?!-with-lease|-if-includes)|-f)(?=$|[\s;&|)"'`])/,
	},
	{ what: 'runs as root', pattern: /(^|[\s;&|(`$])sudo\s+[^\s-]/ },
]
/** Words that give a reason. */
const reason = /\b(because|since|so\s+that|so\s+the|reason|needed|needs|requires?d?|in\s+order\s+to)\b/i
/** A comment after the command on its line. */
const trailingComment = /\S\s+(#|\/\/|<!--)\s*\S/
const fence = /^\s*(```|~~~)/

/**
 * Whether the command on `lines[index]` carries a reason on its own line or the nearest line above it. Outside
 * Markdown, a comment line above counts as one; in Markdown a `#` line is a heading, not a reason.
 */
function hasReason(file: string, lines: string[], index: number): boolean {
	const own = lines[index] as string
	if (reason.test(own) || trailingComment.test(own)) return true
	for (let above = index - 1; above >= 0; above--) {
		const line = lines[above] as string
		if (!line.trim() || fence.test(line)) continue
		return reason.test(line) || (!file.endsWith('.md') && /^\s*(#|\/\/)/.test(line))
	}
	return false
}

type Found = { file: string; message: string }

/** SEC-1, SEC-2, and SEC-7 to SEC-12, the default Security aspect's script checks. */
export function checkSecurity(skill: SkillFiles): CheckOutcome[] {
	const found: Record<string, Found[]> = {}
	const add = (id: string, file: string, message: string) => {
		found[id] ??= []
		found[id].push({ file, message })
	}
	for (const file of skill.files) {
		const text = readText(skill, file)
		if (text === undefined) continue
		for (const { kind, pattern } of secrets) if (pattern.test(text)) add('SEC-1', file, `${file} holds ${kind}`)
		for (const location of invisibleIn(file, text)) add('SEC-7', file, location)
		const lines = text.split('\n')
		lines.forEach((line, index) => {
			const at = `${file}:${index + 1}`
			if (downloadAndRun.some((pattern) => pattern.test(line))) add('SEC-2', file, `${at} downloads code and runs it`)
			if (destructive.some((pattern) => pattern.test(line)))
				add('SEC-8', file, `${at} runs a command that destroys data broadly`)
			if (injection.some((pattern) => pattern.test(line)))
				add('SEC-9', file, `${at} holds a prompt-injection phrase or a chat-template delimiter`)
			if (credentials.some((pattern) => pattern.test(line))) add('SEC-10', file, `${at} reads a credential location`)
			if (endpoints.some((pattern) => pattern.test(line)))
				add('SEC-11', file, `${at} names an endpoint that collects data`)
			else if (url.test(line) && sends.some((pattern) => pattern.test(line)))
				add('SEC-11', file, `${at} sends data to a hardcoded URL`)
			for (const { what, pattern } of bypasses)
				if (pattern.test(line) && !hasReason(file, lines, index))
					add('SEC-12', file, `${at} ${what} with no reason given`)
		})
	}
	const outcome = (id: string): CheckOutcome => {
		const list = found[id]
		return list?.length
			? {
					id,
					status: 'fail',
					message: list.map((item) => item.message).join('; '),
					file: (list[0] as Found).file,
				}
			: { id, status: 'pass' }
	}
	return ['SEC-1', 'SEC-2', 'SEC-7', 'SEC-8', 'SEC-9', 'SEC-10', 'SEC-11', 'SEC-12'].map(outcome)
}
