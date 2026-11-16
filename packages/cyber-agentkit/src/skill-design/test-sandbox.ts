import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import type { ReferenceLayers } from '../references/reference-layers.js'
import { resolveReference } from '../references/resolve-reference.js'

/** The reference that holds how `skill test` contains each run (#302), a YAML file layered across the tiers. */
export const sandboxReferenceName = 'skill-design.test.sandbox'

/** The prefix of every sandbox template: `skill-design.test.sandbox.<template>`. */
export const sandboxTemplatePrefix = `${sandboxReferenceName}.`

/** What `--sandbox default` names: a reference name may not end in `.default`. */
export const defaultTemplate = 'claude-code'

/** The plugin whose own copy of each sandbox reference is read: this package. */
export const sandboxPlugin = 'cyber-agentkit'

/**
 * How a run is contained (#302). The run-specific paths (its folder, home, plugin copy, the node install) are worked
 * out when the run starts; these are the choices around them.
 */
export type SandboxSettings = {
	/** Claude Code's OS sandbox around the agent's shell commands (research E-CC-D15). */
	shell: {
		sandbox: boolean
		failIfUnavailable: boolean
		allowUnsandboxedCommands: boolean
		/** `case-hosts`: only the hosts the case lists, held by the sandbox. `open`: no sandbox network rule. */
		network: 'case-hosts' | 'open'
		/** Refuse reads of the home folders and the system temp folder, but for the run's own folders. */
		hideHome: boolean
	}
	/** The script sandbox (srt, research E22) around setup scripts and `script` checks. */
	scripts: { sandbox: boolean; network: 'closed' | 'open' }
	/** Claude Code's file-tool limits (E-CC-D15), which hold with the OS sandbox off (E-CC-D23). */
	fileTools: { blockReadsOutsideWorkingDirectories: boolean; blockWritesOutsideWorkingDirectories: boolean }
	/** The PreToolUse hook that refuses a file tool outside the run's folders, and records it. */
	hook: boolean
}

export type TestSandbox = {
	settings: SandboxSettings
	/** The templates the settings were built from, the one the chosen file names first, such as `folder-only`. */
	templates: string[]
	/** Where the chosen file came from: `--sandbox`, a tier (`managed`, `repo`, `user`), or the plugin's own copy. */
	from: 'flag' | 'managed' | 'repo' | 'user' | 'plugin'
	warnings: string[]
}

export type SandboxProblem = { code: 'unknown-sandbox' | 'sandbox-invalid' | 'sandbox-missing'; problem: string }

/** `none` when neither sandbox runs, `shell-only` or `scripts-only` when one does; undefined when both do. */
export function sandboxLabel(settings: SandboxSettings): 'none' | 'shell-only' | 'scripts-only' | undefined {
	if (settings.shell.sandbox && settings.scripts.sandbox) return undefined
	if (settings.shell.sandbox) return 'shell-only'
	if (settings.scripts.sandbox) return 'scripts-only'
	return 'none'
}

/** The tiers that may choose and change the sandbox; besides them only this plugin's own copy is read. */
const choosingTiers = new Set(['managed', 'repo', 'user'])

type Shape = Record<string, readonly string[] | 'boolean'>
const shape: Record<keyof SandboxSettings, Shape | 'boolean'> = {
	shell: {
		sandbox: 'boolean',
		failIfUnavailable: 'boolean',
		allowUnsandboxedCommands: 'boolean',
		network: ['case-hosts', 'open'],
		hideHome: 'boolean',
	},
	scripts: { sandbox: 'boolean', network: ['closed', 'open'] },
	fileTools: { blockReadsOutsideWorkingDirectories: 'boolean', blockWritesOutsideWorkingDirectories: 'boolean' },
	hook: 'boolean',
}

type Partial2 = {
	[K in keyof SandboxSettings]?: SandboxSettings[K] extends object ? Partial<SandboxSettings[K]> : SandboxSettings[K]
}
type Parsed = { extends?: string; settings: Partial2 }

const kind = (value: unknown) => (Array.isArray(value) ? 'a list' : value === null ? 'null' : typeof value)

function checkValue(key: string, value: unknown, rule: readonly string[] | 'boolean'): string | undefined {
	if (rule === 'boolean')
		return typeof value === 'boolean' ? undefined : `${key} must be true or false, not ${JSON.stringify(value)}`
	return typeof value === 'string' && rule.includes(value)
		? undefined
		: `${key} must be ${rule.join(' or ')}, not ${JSON.stringify(value)}`
}

/** Reads one sandbox document: its `extends` and the settings it sets, every key and value checked. */
export function parseSandbox(content: string): Parsed | { problem: string } {
	let value: unknown
	try {
		value = parseYaml(content)
	} catch (error) {
		return { problem: `it is not YAML: ${(error as Error).message.split('\n')[0]}` }
	}
	if (value === null || value === undefined) return { settings: {} }
	if (typeof value !== 'object' || Array.isArray(value)) return { problem: `it must be a mapping, not ${kind(value)}` }
	const parsed: Parsed = { settings: {} }
	for (const [key, given] of Object.entries(value as Record<string, unknown>)) {
		if (key === 'extends') {
			if (typeof given !== 'string' || !given.startsWith(sandboxTemplatePrefix) || given === sandboxTemplatePrefix)
				return {
					problem: `extends must name a ${sandboxTemplatePrefix}<template> reference, not ${JSON.stringify(given)}`,
				}
			parsed.extends = given
			continue
		}
		const rule = shape[key as keyof SandboxSettings]
		if (rule === undefined)
			return { problem: `unknown key ${key}; the keys are extends, ${Object.keys(shape).join(', ')}` }
		if (rule === 'boolean') {
			const wrong = checkValue(key, given, rule)
			if (wrong) return { problem: wrong }
			;(parsed.settings as Record<string, unknown>)[key] = given
			continue
		}
		if (!given || typeof given !== 'object' || Array.isArray(given))
			return { problem: `${key} must be a mapping, not ${kind(given)}` }
		const group: Record<string, unknown> = {}
		for (const [inner, innerValue] of Object.entries(given as Record<string, unknown>)) {
			const innerRule = rule[inner]
			if (innerRule === undefined)
				return { problem: `unknown key ${key}.${inner}; ${key} takes ${Object.keys(rule).join(', ')}` }
			const wrong = checkValue(`${key}.${inner}`, innerValue, innerRule)
			if (wrong) return { problem: wrong }
			group[inner] = innerValue
		}
		;(parsed.settings as Record<string, unknown>)[key] = group
	}
	return parsed
}

/** The settings of `over` laid on `under`, key by key. */
function layer(under: Partial2, over: Partial2): Partial2 {
	const merged: Record<string, unknown> = { ...under }
	for (const [key, value] of Object.entries(over))
		merged[key] = typeof value === 'object' ? { ...((under as Record<string, object>)[key] ?? {}), ...value } : value
	return merged as Partial2
}

/** Answers a problem for settings that miss a key, or that ask for a network rule no sandbox is verified to hold. */
function complete(settings: Partial2): SandboxSettings | { problem: string } {
	for (const [key, rule] of Object.entries(shape)) {
		const value = (settings as Record<string, unknown>)[key]
		if (value === undefined) return { problem: `it sets no ${key}` }
		if (rule !== 'boolean')
			for (const inner of Object.keys(rule))
				if ((value as Record<string, unknown>)[inner] === undefined) return { problem: `it sets no ${key}.${inner}` }
	}
	const full = settings as SandboxSettings
	if (full.shell.sandbox && full.shell.network === 'open')
		return {
			problem: 'shell.network open needs shell.sandbox false: an open network in the OS sandbox is not supported',
		}
	if (full.scripts.sandbox && full.scripts.network === 'open')
		return { problem: 'scripts.network open needs scripts.sandbox false: the script sandbox runs with no network' }
	return full
}

type Found = { content: string; path: string; tier: 'managed' | 'repo' | 'user' | 'plugin' }

/**
 * The document that answers `name` from a tier allowed to: the highest of the managed, repo, and user tiers that holds
 * it, else this plugin's own copy. Another plugin's copy, a skill's default, and a project section are passed over, so
 * nothing a skill or another plugin ships can choose or loosen the sandbox; `skipped` names a plugin copy passed over.
 */
function allowedAnswer(name: string, layers: ReferenceLayers): { found?: Found; skipped: string[] } {
	const resolved = resolveReference(name, layers)
	const skipped: string[] = []
	for (const entry of resolved.trace.layers) {
		if (!entry.file) continue
		const own = entry.tier === 'plugin' && entry.plugin === sandboxPlugin
		if (!choosingTiers.has(entry.tier) && !own) {
			if (entry.tier === 'plugin') skipped.push(entry.plugin ?? '?')
			continue
		}
		try {
			return {
				found: { content: readFileSync(entry.path, 'utf8'), path: entry.path, tier: entry.tier as Found['tier'] },
				skipped,
			}
		} catch {}
	}
	return { skipped }
}

/**
 * The sandbox a test runs in (#302). `--sandbox <template>` loads `skill-design.test.sandbox.<template>` (`default`
 * names `claude-code`); otherwise `skill-design.test.sandbox` itself. The document that answers comes from the managed,
 * repo, or user tier, or this plugin's own copy, and it may name a template in `extends`, whose settings it changes key
 * by key. Answers a problem, rather than run in a sandbox the user did not mean, for an unknown template, a document
 * with an unknown key or a bad value, an `extends` cycle, or settings left incomplete.
 */
export function resolveTestSandbox(layers: ReferenceLayers, flag: string | undefined): TestSandbox | SandboxProblem {
	const warnings: string[] = []
	let name = sandboxReferenceName
	if (flag !== undefined) {
		const template = flag === 'default' ? defaultTemplate : flag
		if (!/^[a-z0-9][a-z0-9-]*$/.test(template))
			return {
				code: 'unknown-sandbox',
				problem: `no sandbox template ${flag}: a template is named in lowercase words and dashes`,
			}
		name = `${sandboxTemplatePrefix}${template}`
	}
	const chain: string[] = []
	const docs: Parsed[] = []
	let from: TestSandbox['from'] | undefined
	for (let at: string | undefined = name; at !== undefined; ) {
		if (chain.includes(at))
			return {
				code: 'sandbox-invalid',
				problem: `${sandboxReferenceName}: extends forms a cycle: ${[...chain, at].join(' → ')}`,
			}
		chain.push(at)
		const { found, skipped } = allowedAnswer(at, layers)
		for (const plugin of skipped)
			warnings.push(
				`sandbox-not-chosen: ${at} from plugin ${plugin} is not read; only the managed, repo, and user tiers, --sandbox, and ${sandboxPlugin}'s own copy set the sandbox`,
			)
		if (!found) {
			if (at === name && flag !== undefined)
				return { code: 'unknown-sandbox', problem: `no sandbox template ${flag}: no tier holds ${at}` }
			return {
				code: 'sandbox-missing',
				problem: `no tier holds ${at}${at === name ? '' : `, which ${chain.at(-2)} extends`}`,
			}
		}
		from ??= flag !== undefined ? 'flag' : found.tier
		const parsed = parseSandbox(found.content)
		if ('problem' in parsed) return { code: 'sandbox-invalid', problem: `${at} at ${found.path}: ${parsed.problem}` }
		docs.push(parsed)
		at = parsed.extends
	}
	const merged = docs.reduceRight<Partial2>((under, doc) => layer(under, doc.settings), {})
	const settings = complete(merged)
	if ('problem' in settings) return { code: 'sandbox-invalid', problem: `${name}: ${settings.problem}` }
	const templates = chain
		.filter((at) => at.startsWith(sandboxTemplatePrefix))
		.map((at) => at.slice(sandboxTemplatePrefix.length))
	return { settings, templates, from: from ?? 'plugin', warnings: [...new Set(warnings)] }
}
