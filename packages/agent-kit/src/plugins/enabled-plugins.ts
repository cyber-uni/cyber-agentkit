import { join } from 'node:path'

import {
	type HarnessEnvironment,
	type ResolvedHarnessEnvironment,
	resolveHarnessEnvironment,
} from '../harness/harness-environment.js'
import type { HarnessId } from '../harness/harness-id.js'
import { type ManagedPolicyLocation, managedPolicyLocations } from '../managed-policy/managed-policy-locations.js'
import { isRecord, readText, stripJsonComments } from './json-file.js'
import { pluginStorage } from './plugin-storage.js'

/** The settings scope a plugin's enabled state came from. */
export type PluginScope = 'managed' | 'local' | 'project' | 'user'

export interface PluginEnablement {
	/** The key the harness uses, `<plugin>@<marketplace>`. */
	readonly id: string
	readonly enabled: boolean
	/** The scope whose value won. */
	readonly scope: PluginScope
	/** The file the winning value was read from. */
	readonly source: string
}

export interface EnabledPluginSource {
	readonly scope: PluginScope
	readonly path: string
	/** `false` when the file does not exist. */
	readonly found: boolean
	/** Set when the file exists but could not be parsed; its entries are then ignored. */
	readonly error?: string
}

export interface EnabledPluginsResult {
	readonly harness: HarnessId
	/** `false` when the harness keeps no readable record of enabled plugins. */
	readonly supported: boolean
	/** Each plugin with an explicit entry, resolved across scopes. */
	readonly plugins: readonly PluginEnablement[]
	/** The files consulted, highest precedence first. */
	readonly sources: readonly EnabledPluginSource[]
	/**
	 * Sources that can also decide a plugin's state but that this package does not read, such as
	 * MDM or server-managed policy. When non-empty, `plugins` may not be the whole answer.
	 */
	readonly unread: readonly string[]
	/** The claim IDs in `.research/harness-detection/evidence.md` behind the resolution. */
	readonly research: readonly string[]
}

interface SettingsSource {
	readonly scope: PluginScope
	readonly path: string
	readonly parse: (text: string) => Readonly<Record<string, boolean>>
}

interface EnabledPluginsReader {
	readonly supported: boolean
	/** Highest precedence first. */
	readonly sources: readonly SettingsSource[]
	readonly unread: readonly string[]
	readonly research: readonly string[]
}

export interface EnabledPluginsOptions extends HarnessEnvironment {
	/**
	 * Read the managed settings file from here instead of the harness's documented location.
	 * Useful when policy is staged elsewhere, and in tests.
	 */
	readonly managedSettingsPath?: string
}

/**
 * Read which plugins a harness has enabled, from the settings files it keeps on disk.
 *
 * Only plugins with an explicit entry are reported; a plugin with no entry falls back to a
 * harness- or plugin-defined default this package does not know. See `unread` for policy sources
 * that may override what the files say.
 */
export async function enabledPlugins(
	harness: HarnessId,
	options: EnabledPluginsOptions = {},
): Promise<EnabledPluginsResult> {
	const reader = readers[harness](resolveHarnessEnvironment(options), options.managedSettingsPath)
	const plugins = new Map<string, PluginEnablement>()
	const sources: EnabledPluginSource[] = []

	for (const source of reader.sources) {
		let entries: Readonly<Record<string, boolean>>
		try {
			const text = await readText(source.path)
			if (text === undefined) {
				sources.push({ scope: source.scope, path: source.path, found: false })
				continue
			}
			entries = source.parse(text)
		} catch (error) {
			sources.push({ scope: source.scope, path: source.path, found: true, error: String(error) })
			continue
		}
		sources.push({ scope: source.scope, path: source.path, found: true })
		for (const [id, enabled] of Object.entries(entries)) {
			if (!plugins.has(id)) plugins.set(id, { id, enabled, scope: source.scope, source: source.path })
		}
	}

	return {
		harness,
		supported: reader.supported,
		plugins: [...plugins.values()],
		sources,
		unread: reader.unread,
		research: reader.research,
	}
}

/** Read the `enabledPlugins` object of a JSON settings file, keeping boolean values only. */
function jsonEnabledPlugins(text: string): Record<string, boolean> {
	const settings: unknown = JSON.parse(text)
	const map = isRecord(settings) ? settings.enabledPlugins : undefined
	if (!isRecord(map)) return {}
	return Object.fromEntries(
		Object.entries(map).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
	)
}

const pluginTableHeader = /^\[\s*plugins\s*\.\s*(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*\]\s*(?:#.*)?$/
const enabledKey = /^enabled\s*=\s*(true|false)\s*(?:#.*)?$/

/**
 * Read `enabled` from each `[plugins."<id>"]` table of a Codex `config.toml`. This is not a TOML
 * parser: it recognizes only that table header and that key, which is all Codex writes there.
 */
function tomlEnabledPlugins(text: string): Record<string, boolean> {
	const result: Record<string, boolean> = {}
	let current: string | undefined
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim()
		if (line.startsWith('[')) {
			const match = pluginTableHeader.exec(line)
			current = match ? (match[1] ?? match[2] ?? match[3]) : undefined
			continue
		}
		const enabled = current === undefined ? null : enabledKey.exec(line)
		if (current !== undefined && enabled) result[current] = enabled[1] === 'true'
	}
	return result
}

const unreadLabels: Record<ManagedPolicyLocation['kind'], string> = {
	server: 'server-managed settings',
	'macos-managed-preferences': 'MDM managed preferences',
	'windows-registry': 'Windows registry policy',
	directory: 'drop-in managed settings',
	file: 'managed file',
}

/** Describe the managed locations that are not the one managed file this package reads. */
function unreadPolicy(
	locations: readonly ManagedPolicyLocation[],
	read: string | undefined,
	skip: readonly string[] = [],
) {
	return locations
		.filter((l) => l.location !== read && !skip.some((suffix) => l.location.endsWith(suffix)))
		.map((l) => `${unreadLabels[l.kind]} (${l.location})`)
}

function managedFile(locations: readonly ManagedPolicyLocation[], name: string) {
	return locations.find((l) => l.kind === 'file' && l.location.endsWith(name))?.location
}

function jsoncEnabledPlugins(text: string): Record<string, boolean> {
	return jsonEnabledPlugins(stripJsonComments(text))
}

/** A harness whose enabled plugins this package cannot read; `research` says why. */
const unsupported = (...research: string[]): EnabledPluginsReader => ({
	supported: false,
	sources: [],
	unread: [],
	research,
})

type Reader = (environment: ResolvedHarnessEnvironment, managedSettingsPath: string | undefined) => EnabledPluginsReader

const readers: Record<HarnessId, Reader> = {
	'claude-code': (environment, managedSettingsPath) => {
		const { configDir } = pluginStorage('claude-code', environment)
		const policy = managedPolicyLocations('claude-code', environment)
		const documentedManaged = managedFile(policy, 'managed-settings.json')
		const managed = managedSettingsPath ?? documentedManaged
		const project = join(environment.cwd, '.claude')
		return {
			supported: true,
			sources: [
				...(managed === undefined ? [] : [{ scope: 'managed' as const, path: managed, parse: jsonEnabledPlugins }]),
				{ scope: 'local', path: join(project, 'settings.local.json'), parse: jsonEnabledPlugins },
				{ scope: 'project', path: join(project, 'settings.json'), parse: jsonEnabledPlugins },
				{ scope: 'user', path: join(configDir, 'settings.json'), parse: jsonEnabledPlugins },
			],
			unread: unreadPolicy(policy, documentedManaged, ['managed-mcp.json']),
			research: ['E-CC-P3', 'E-CC-P7', 'E-CC-M1', 'E-CC-M6'],
		}
	},
	cursor: () => unsupported(),
	// Loaded plugins are the ones present in a plugin folder or the config array (E-OC-P3, E-KILO-P3).
	opencode: () => unsupported('E-OC-P3'),
	kilo: () => unsupported('E-KILO-P3'),
	// extension-enablement.json holds path-glob overrides, not a per-extension boolean (E-GEM-P3).
	'gemini-cli': () => unsupported('E-GEM-P3'),
	'qwen-code': () => unsupported('E-QWEN-P2'),
	'vscode-copilot': () => unsupported('E-VSC-P4'),
	cline: () => unsupported('E-CLINE-P4'),
	crush: () => unsupported('E-CRUSH-P2'),
	// Enabled state sits in per-plugin install metadata keyed by name, not plugin@marketplace (E-OH-P4).
	openhands: () => unsupported('E-OH-P4'),
	// Auggie merges only the true entries across scopes, so a false entry never disables (E-AUG-P4).
	augment: () => unsupported('E-AUG-P4'),
	codex: (environment) => {
		const storage = pluginStorage('codex', environment)
		return {
			supported: true,
			sources: [{ scope: 'user', path: join(storage.configDir, 'config.toml'), parse: tomlEnabledPlugins }],
			unread: unreadPolicy(managedPolicyLocations('codex', environment), undefined),
			research: ['E-CODEX-P2', 'E-CODEX-M7'],
		}
	},
	'copilot-cli': (environment, managedSettingsPath) => {
		const storage = pluginStorage('copilot-cli', environment)
		const policy = managedPolicyLocations('copilot-cli', environment)
		const documentedManaged = managedFile(policy, 'managed-settings.json')
		const managed = managedSettingsPath ?? documentedManaged
		const repository = join(environment.cwd, '.github', 'copilot')
		const claude = join(environment.cwd, '.claude')
		return {
			supported: true,
			sources: [
				// Managed entries win per plugin over every local scope (E-COPILOT-M4).
				...(managed === undefined ? [] : [{ scope: 'managed' as const, path: managed, parse: jsoncEnabledPlugins }]),
				{ scope: 'local', path: join(repository, 'settings.local.json'), parse: jsoncEnabledPlugins },
				{ scope: 'project', path: join(repository, 'settings.json'), parse: jsoncEnabledPlugins },
				{ scope: 'user', path: join(storage.configDir, 'settings.json'), parse: jsoncEnabledPlugins },
			],
			unread: [
				...unreadPolicy(policy, documentedManaged),
				// Read by Copilot CLI, but the docs do not rank them against .github/copilot (E-COPILOT-P4).
				`Claude Code project settings (${join(claude, 'settings.json')})`,
				`Claude Code local settings (${join(claude, 'settings.local.json')})`,
			],
			research: ['E-COPILOT-P4', 'E-COPILOT-M1', 'E-COPILOT-M2', 'E-COPILOT-M4'],
		}
	},
}
