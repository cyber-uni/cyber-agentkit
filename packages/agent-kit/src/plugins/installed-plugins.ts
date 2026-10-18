import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
	type HarnessEnvironment,
	type ResolvedHarnessEnvironment,
	resolveHarnessEnvironment,
} from '../harness/harness-environment.js'
import type { HarnessId } from '../harness/harness-id.js'
import type { PluginScope } from './enabled-plugins.js'
import { isRecord, readText, stripJsonComments } from './json-file.js'
import { pluginStorage } from './plugin-storage.js'

export interface InstalledPlugin {
	/**
	 * `<plugin>@<marketplace>`, the key `enabledPlugins()` reports. A Copilot CLI direct install
	 * has no marketplace, so its id is the bare plugin name (E-COPILOT-P11).
	 */
	readonly id: string
	/** The absolute folder the harness loads the plugin from. */
	readonly path: string
	readonly version?: string
	/** The install scope, for harnesses that record one. */
	readonly scope?: PluginScope
	/** The project a project- or local-scoped install belongs to. */
	readonly projectPath?: string
	/** The claim IDs in `.research/harness-detection/evidence.md` behind this entry. */
	readonly research: readonly string[]
}

export interface InstalledPluginSource {
	readonly path: string
	/** `false` when the file or folder does not exist. */
	readonly found: boolean
	/** Set when it exists but could not be read; nothing is reported from it. */
	readonly error?: string
}

export interface InstalledPluginsResult {
	readonly harness: HarnessId
	/** `false` when this package has no verified install record for the harness. */
	readonly supported: boolean
	/** One entry per install. Claude Code can install one plugin at several scopes. */
	readonly plugins: readonly InstalledPlugin[]
	/** The ids of installed plugins whose folder cannot be determined without guessing. */
	readonly unresolved: readonly string[]
	/** The files or folders consulted. */
	readonly sources: readonly InstalledPluginSource[]
	/** Installs the harness can load that this package does not read. */
	readonly unread: readonly string[]
	/** The claim IDs in `.research/harness-detection/evidence.md` behind the resolution. */
	readonly research: readonly string[]
}

interface Installs {
	readonly plugins: readonly InstalledPlugin[]
	readonly unresolved?: readonly string[]
}

interface InstalledPluginsReader {
	readonly supported: boolean
	readonly source?: string
	readonly read: (source: string) => Promise<Installs | undefined>
	readonly unread: readonly string[]
	readonly research: readonly string[]
}

/**
 * Map each plugin a harness has installed to the folder it is loaded from. Join the result with
 * `enabledPlugins()` by `id` to find an enabled plugin's folder.
 */
export async function installedPlugins(
	harness: HarnessId,
	environment: HarnessEnvironment = {},
): Promise<InstalledPluginsResult> {
	const reader = readers[harness](resolveHarnessEnvironment(environment))
	const result = { harness, supported: reader.supported, unread: reader.unread, research: reader.research }
	if (reader.source === undefined) return { ...result, plugins: [], unresolved: [], sources: [] }

	const path = reader.source
	try {
		const installs = await reader.read(path)
		if (installs === undefined) return { ...result, plugins: [], unresolved: [], sources: [{ path, found: false }] }
		return {
			...result,
			plugins: installs.plugins,
			unresolved: installs.unresolved ?? [],
			sources: [{ path, found: true }],
		}
	} catch (error) {
		return { ...result, plugins: [], unresolved: [], sources: [{ path, found: true, error: String(error) }] }
	}
}

const scopes: readonly string[] = ['managed', 'local', 'project', 'user'] satisfies PluginScope[]

const optionalString = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

/** Read `installed_plugins.json`: `plugin@marketplace` → `[{ scope, installPath, version, … }]` (E-CC-P2). */
async function readClaudeInstalls(path: string): Promise<Installs | undefined> {
	const text = await readText(path)
	if (text === undefined) return undefined
	const record: unknown = JSON.parse(text)
	const map = isRecord(record) ? record.plugins : undefined
	if (!isRecord(map)) return { plugins: [] }

	const plugins: InstalledPlugin[] = []
	for (const [id, entries] of Object.entries(map)) {
		if (!Array.isArray(entries)) continue
		for (const entry of entries) {
			const installPath = isRecord(entry) ? optionalString(entry.installPath) : undefined
			if (!isRecord(entry) || installPath === undefined) continue
			const version = optionalString(entry.version)
			const scope = typeof entry.scope === 'string' && scopes.includes(entry.scope) ? entry.scope : undefined
			const projectPath = optionalString(entry.projectPath)
			plugins.push({
				id,
				path: installPath,
				...(version === undefined ? {} : { version }),
				...(scope === undefined ? {} : { scope: scope as PluginScope }),
				...(projectPath === undefined ? {} : { projectPath }),
				research: ['E-CC-P2'],
			})
		}
	}
	return { plugins }
}

/** Read `config.json` `installedPlugins`: `[{ name, marketplace, version, cache_path, … }]` (E-COPILOT-P10). */
async function readCopilotInstalls(path: string): Promise<Installs | undefined> {
	const text = await readText(path)
	if (text === undefined) return undefined
	const config: unknown = JSON.parse(stripJsonComments(text))
	const entries = isRecord(config) ? config.installedPlugins : undefined
	if (!Array.isArray(entries)) return { plugins: [] }

	const plugins: InstalledPlugin[] = []
	for (const entry of entries) {
		if (!isRecord(entry)) continue
		const name = optionalString(entry.name)
		const cachePath = optionalString(entry.cache_path)
		if (name === undefined || cachePath === undefined) continue
		const marketplace = optionalString(entry.marketplace)
		const version = optionalString(entry.version)
		plugins.push({
			id: marketplace === undefined ? name : `${name}@${marketplace}`,
			path: cachePath,
			...(version === undefined ? {} : { version }),
			research: marketplace === undefined ? ['E-COPILOT-P10', 'E-COPILOT-P11'] : ['E-COPILOT-P10'],
		})
	}
	return { plugins }
}

/** Codex's `DEFAULT_PLUGIN_VERSION`: a `local` folder always wins (E-CODEX-P8). */
const localVersion = 'local'

/** `validate_plugin_segment`: marketplace names take no dots; plugin names take them between parts. */
const marketplaceName = /^[A-Za-z0-9_-]+$/
const pluginName = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/
/** `validate_plugin_version_segment`. */
const versionName = /^[A-Za-z0-9._+-]+$/

/** Scan `plugins/cache/<marketplace>/<plugin>/<version>/`; Codex keeps no install record (E-CODEX-P8). */
async function readCodexInstalls(cache: string): Promise<Installs | undefined> {
	const marketplaces = await directories(cache)
	if (marketplaces === undefined) return undefined

	const plugins: InstalledPlugin[] = []
	const unresolved: string[] = []
	for (const marketplace of marketplaces.filter((name) => marketplaceName.test(name))) {
		for (const plugin of (await directories(join(cache, marketplace))) ?? []) {
			if (!pluginName.test(plugin)) continue
			const id = `${plugin}@${marketplace}`
			const versions = ((await directories(join(cache, marketplace, plugin))) ?? []).filter(
				(name) => versionName.test(name) && name !== '.' && name !== '..',
			)
			if (versions.length === 0) continue
			const version = activeCodexVersion(versions)
			if (version === undefined) {
				unresolved.push(id)
				continue
			}
			plugins.push({
				id,
				path: join(cache, marketplace, plugin, version),
				version,
				research: ['E-CODEX-P3', 'E-CODEX-P8'],
			})
		}
	}
	return { plugins, unresolved }
}

/**
 * Codex's `active_plugin_version`: `local` if present, else the last folder after sorting with
 * `compare_plugin_versions`. That comparison mixes semver and string order, so when three or more
 * folders mix semver and non-semver names it is not a total order and the pick depends on the
 * sort; that case returns `undefined`.
 */
function activeCodexVersion(versions: readonly string[]): string | undefined {
	if (versions.includes(localVersion)) return localVersion
	const parsed = versions.filter((v) => parseSemver(v) !== undefined).length
	if (versions.length > 2 && parsed !== 0 && parsed !== versions.length) return undefined
	return [...versions].sort(compareCodexVersions).at(-1)
}

async function directories(path: string): Promise<string[] | undefined> {
	try {
		const entries = await readdir(path, { withFileTypes: true })
		return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
		throw error
	}
}

interface Semver {
	readonly core: readonly [string, string, string]
	readonly pre: readonly string[]
	readonly build: readonly string[]
}

const semverPattern =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

/** Parse a version as the Rust `semver` crate does: strict SemVer 2.0, no leading `v`. */
function parseSemver(text: string): Semver | undefined {
	const match = semverPattern.exec(text)
	if (!match) return undefined
	return {
		core: [match[1] as string, match[2] as string, match[3] as string],
		pre: match[4] === undefined ? [] : match[4].split('.'),
		build: match[5] === undefined ? [] : match[5].split('.'),
	}
}

/** `compare_plugin_versions`: semver order when both parse, else byte order of the names. */
function compareCodexVersions(left: string, right: string): number {
	const a = parseSemver(left)
	const b = parseSemver(right)
	if (a === undefined || b === undefined) return compareStrings(left, right)
	for (let i = 0; i < 3; i++) {
		const order = compareNumeric(a.core[i] as string, b.core[i] as string)
		if (order !== 0) return order
	}
	// A version without a pre-release sorts after one with it.
	const pre = a.pre.length === 0 || b.pre.length === 0 ? b.pre.length - a.pre.length : compareIdentifiers(a.pre, b.pre)
	if (pre !== 0) return Math.sign(pre)
	// Build metadata takes part in the `semver` crate's ordering; none sorts first.
	return compareIdentifiers(a.build, b.build)
}

const numeric = /^\d+$/

function compareIdentifiers(left: readonly string[], right: readonly string[]): number {
	for (let i = 0; i < Math.min(left.length, right.length); i++) {
		const a = left[i] as string
		const b = right[i] as string
		const aNumeric = numeric.test(a)
		const bNumeric = numeric.test(b)
		const order =
			aNumeric && bNumeric ? compareNumeric(a, b) : aNumeric !== bNumeric ? (aNumeric ? -1 : 1) : compareStrings(a, b)
		if (order !== 0) return order
	}
	return left.length - right.length
}

/** Compare digit strings by value without overflow; build metadata may carry leading zeros. */
function compareNumeric(left: string, right: string): number {
	const a = left.replace(/^0+(?=\d)/, '')
	const b = right.replace(/^0+(?=\d)/, '')
	return a.length - b.length || compareStrings(a, b) || left.length - right.length
}

const compareStrings = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0)

/** A harness with no verified install record. */
const unsupported: InstalledPluginsReader = {
	supported: false,
	read: async () => undefined,
	unread: [],
	research: [],
}

type Reader = (environment: ResolvedHarnessEnvironment) => InstalledPluginsReader

const readers: Record<HarnessId, Reader> = {
	'claude-code': (environment) => ({
		supported: true,
		source: join(pluginStorage('claude-code', environment).configDir, 'plugins', 'installed_plugins.json'),
		read: readClaudeInstalls,
		unread: [],
		research: ['E-CC-P2'],
	}),
	codex: (environment) => ({
		supported: true,
		source: join(pluginStorage('codex', environment).configDir, 'plugins', 'cache'),
		read: readCodexInstalls,
		unread: [],
		research: ['E-CODEX-P3', 'E-CODEX-P8'],
	}),
	'copilot-cli': (environment) => {
		const { configDir } = pluginStorage('copilot-cli', environment)
		return {
			supported: true,
			// XDG_CONFIG_HOME does not move it (E-COPILOT-P13).
			source: join(configDir, 'config.json'),
			read: readCopilotInstalls,
			unread: [
				// Loaded in place from the marketplace folder; no config.json entry (E-COPILOT-P12).
				`plugins from marketplaces added by local path (extraKnownMarketplaces in ${join(configDir, 'settings.json')})`,
			],
			research: ['E-COPILOT-P10', 'E-COPILOT-P11', 'E-COPILOT-P12', 'E-COPILOT-P13'],
		}
	},
	cursor: () => unsupported,
	opencode: () => unsupported,
	kilo: () => unsupported,
	'gemini-cli': () => unsupported,
	'qwen-code': () => unsupported,
	'vscode-copilot': () => unsupported,
	cline: () => unsupported,
	crush: () => unsupported,
	openhands: () => unsupported,
	augment: () => unsupported,
}
