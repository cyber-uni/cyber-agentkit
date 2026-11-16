import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { ReferenceLayer, ReferenceLayers } from '../references/reference-layers.js'
import { layerNames, resolveReference } from '../references/resolve-reference.js'

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
type Parsed = { settings: Partial2 }

const kind = (value: unknown) => (Array.isArray(value) ? 'a list' : value === null ? 'null' : typeof value)

function checkValue(key: string, value: unknown, rule: readonly string[] | 'boolean'): string | undefined {
	if (rule === 'boolean')
		return typeof value === 'boolean' ? undefined : `${key} must be true or false, not ${JSON.stringify(value)}`
	return typeof value === 'string' && rule.includes(value)
		? undefined
		: `${key} must be ${rule.join(' or ')}, not ${JSON.stringify(value)}`
}

/**
 * Reads one sandbox document: the settings it sets, every key and value checked. Which template it builds on is its
 * metadata file's `extends`, never a key inside the YAML.
 */
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
			return {
				problem: `extends does not go inside the YAML; put \`extends: [<plugin>/${sandboxReferenceName}.<template>]\` in its metadata file ${sandboxReferenceName}.meta.md`,
			}
		}
		const rule = shape[key as keyof SandboxSettings]
		if (rule === undefined) return { problem: `unknown key ${key}; the keys are ${Object.keys(shape).join(', ')}` }
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

/**
 * The `references/` folder this package ships, found from this file up to the `cyber-agentkit` package root, whether
 * it runs from `src/`, `dist/`, or a bundled skill script. Undefined when it is not there, such as in a skill folder
 * copied out of the package.
 */
export function shippedReferences(): string | undefined {
	let at = dirname(fileURLToPath(import.meta.url))
	for (;;) {
		try {
			const manifest = JSON.parse(readFileSync(join(at, 'package.json'), 'utf8')) as { name?: unknown }
			if (manifest.name === sandboxPlugin && existsSync(join(at, 'references'))) return join(at, 'references')
		} catch {}
		const up = dirname(at)
		if (up === at) return undefined
		at = up
	}
}

const missingCodes = new Set(['extends-step-missing', 'extends-reference-missing', 'extends-all-missing'])
const invalidCodes = new Set([
	'extends-invalid',
	'extends-self',
	'extends-step-not-allowed',
	'data-merge-invalid',
	'data-not-merged',
	'format-mismatch',
	'file-ignored',
])

/**
 * A tier's `<name>.yaml` that still writes `extends` inside the YAML, as `skill test` first read it (#303), read the
 * new way: a copy of its folder with the key taken out and the pick in a metadata file beside it. The original is
 * never changed.
 */
function readLegacy(
	layer: ReferenceLayer,
	name: string,
	into: string,
	warnings: string[],
): ReferenceLayer | { problem: string } {
	for (const extension of ['.yaml', '.yml']) {
		const file = join(layer.dir, `${name}${extension}`)
		let text: string
		try {
			text = readFileSync(file, 'utf8')
		} catch {
			continue
		}
		let value: unknown
		try {
			value = parseYaml(text)
		} catch {
			return layer
		}
		if (!value || typeof value !== 'object' || Array.isArray(value) || !('extends' in value)) return layer
		const given = (value as Record<string, unknown>)['extends']
		const metadata = join(layer.dir, `${name}.meta.md`)
		if (existsSync(metadata) && /^extends\s*:/m.test(readFileSync(metadata, 'utf8'))) return layer
		if (typeof given !== 'string' || !given.startsWith(sandboxTemplatePrefix) || given === sandboxTemplatePrefix) {
			return {
				problem: `${file}: extends must name a ${sandboxTemplatePrefix}<template> reference, not ${JSON.stringify(given)}`,
			}
		}
		const { extends: _moved, ...rest } = value as Record<string, unknown>
		const dir = mkdtempSync(join(into, 'legacy-'))
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, `${name}${extension}`), stringifyYaml(rest))
		const extra = `---\nextends: [${sandboxPlugin}/${given}]\n---\n`
		writeFileSync(join(dir, `${name}.meta.md`), extra)
		warnings.push(
			`sandbox-extends-legacy: ${file} writes extends inside the YAML; read as ${name}.meta.md with extends: [${sandboxPlugin}/${given}]. Move it there`,
		)
		return { ...layer, dir }
	}
	return layer
}

/**
 * The sandbox a test runs in (#302). `--sandbox <template>` loads `skill-design.test.sandbox.<template>` (`default`
 * names `claude-code`); otherwise `skill-design.test.sandbox` itself, which is the claude-code template when no tier
 * writes it. The reference system resolves the name from the managed, repo, and user tiers and this plugin's own copy:
 * a metadata file's `extends` names a template, `<plugin>/skill-design.test.sandbox.<template>`, and the file's own
 * settings merge over it key by key. Another plugin's copy, a skill's default, and a project section never answer on
 * their own, so nothing a skill or another plugin ships can choose or loosen the sandbox; a managed, repo, or user
 * file may still take a template from another plugin by naming it. Answers a problem, rather than run in a sandbox the
 * user did not mean, for an unknown template, a document with an unknown key or a bad value, a missing step, an
 * `extends` cycle, or settings left incomplete.
 */
export function resolveTestSandbox(
	layers: ReferenceLayers,
	flag: string | undefined,
	/** The package's own references folder the plugin copy falls back to; `null` for none. */
	shipped: string | null = shippedReferences() ?? null,
): TestSandbox | SandboxProblem {
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
	const scratch = mkdtempSync(join(tmpdir(), 'sandbox-legacy-'))
	try {
		// The tiers that may choose and the plugins, never a skill's default or a project section; this package's own
		// copy is the shipped folder when no tier gave it, as for a library caller.
		let held = layers.layers.filter(({ tier }) => choosingTiers.has(tier) || tier === 'plugin')
		if (shipped && !held.some(({ tier, plugin }) => tier === 'plugin' && plugin === sandboxPlugin))
			held = [...held, { tier: 'plugin', dir: shipped, plugin: sandboxPlugin }]
		const read = (at: string): ReturnType<typeof resolveReference> | SandboxProblem => {
			const prepared: ReferenceLayer[] = []
			for (const layer of held) {
				const next = choosingTiers.has(layer.tier) ? readLegacy(layer, at, scratch, warnings) : layer
				if ('problem' in next) return { code: 'sandbox-invalid', problem: next.problem }
				prepared.push(next)
			}
			return resolveReference(
				at,
				{ layers: prepared, harnesses: [] },
				{ projectSections: false, answeringPlugins: new Set([sandboxPlugin]) },
			)
		}
		let resolved = read(name)
		if ('problem' in resolved) return resolved
		const fromTier = (r: ReturnType<typeof resolveReference>) =>
			r.trace.layers.find((entry) => choosingTiers.has(entry.tier) && entry.file !== undefined)?.tier as
				| 'managed'
				| 'repo'
				| 'user'
				| undefined
		// No tier writes the name: the plugin's own copy is only its comments, so the default template answers.
		if (flag === undefined && fromTier(resolved) === undefined) {
			name = `${sandboxTemplatePrefix}${defaultTemplate}`
			resolved = read(name)
			if ('problem' in resolved) return resolved
		}
		if (resolved.status === 'invalid')
			return { code: 'unknown-sandbox', problem: `no sandbox template ${flag}: ${resolved.message}` }
		if (resolved.status === 'missing') {
			return flag !== undefined
				? { code: 'unknown-sandbox', problem: `no sandbox template ${flag}: no tier holds ${name}` }
				: { code: 'sandbox-missing', problem: `no tier holds ${name}` }
		}
		if (resolved.status === 'ambiguous')
			return { code: 'sandbox-invalid', problem: `${sandboxReferenceName}: ${resolved.message}` }
		const missing = resolved.warnings.find(({ code }) => missingCodes.has(code))
		if (missing) return { code: 'sandbox-missing', problem: `${name}: ${missing.message}` }
		const invalid = resolved.warnings.find(({ code }) => invalidCodes.has(code))
		if (invalid) return { code: 'sandbox-invalid', problem: `${name}: ${invalid.message}` }
		if (resolved.format !== 'yaml' && resolved.format !== 'json')
			return { code: 'sandbox-invalid', problem: `${name}: it must be YAML, not ${resolved.format}` }
		const parsed = parseSandbox(resolved.content ?? '')
		if ('problem' in parsed) return { code: 'sandbox-invalid', problem: `${name}: ${parsed.problem}` }
		const settings = complete(parsed.settings)
		if ('problem' in settings) return { code: 'sandbox-invalid', problem: `${name}: ${settings.problem}` }
		// The chosen name first, then each template the stack builds on, top down.
		const templates = [
			...new Set(
				[
					name,
					...[...resolved.trace.stack]
						.reverse()
						.map((label) => (label.includes('/') ? label.slice(label.indexOf('/') + 1) : name)),
				]
					.filter((at) => at.startsWith(sandboxTemplatePrefix))
					.map((at) => at.slice(sandboxTemplatePrefix.length)),
			),
		]
		// A copy another plugin holds of a name the chain read is passed over, and says so.
		for (const at of new Set([
			flag === undefined ? sandboxReferenceName : name,
			...templates.map((template) => `${sandboxTemplatePrefix}${template}`),
		])) {
			for (const layer of held) {
				if (layer.tier !== 'plugin' || layer.plugin === sandboxPlugin || layer.skipped) continue
				const used = resolved.trace.layers.some(
					(entry) => entry.plugin === layer.plugin && (entry.name ?? name) === at && entry.outcome === 'used',
				)
				if (!used && layerNames(layer).includes(at))
					warnings.push(
						`sandbox-not-chosen: ${at} from plugin ${layer.plugin} is not read; only the managed, repo, and user tiers, --sandbox, and ${sandboxPlugin}'s own copy set the sandbox`,
					)
			}
		}
		return {
			settings,
			templates,
			from: flag !== undefined ? 'flag' : (fromTier(resolved) ?? 'plugin'),
			warnings: [...new Set(warnings)],
		}
	} finally {
		rmSync(scratch, { recursive: true, force: true })
	}
}
