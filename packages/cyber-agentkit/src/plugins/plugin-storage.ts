import { join, win32 } from 'node:path'

import {
	type HarnessEnvironment,
	type ResolvedHarnessEnvironment,
	resolveHarnessEnvironment,
} from '../harness/harness-environment.js'
import type { HarnessId } from '../harness/harness-id.js'

/**
 * - `plugin-cache`: installed plugin copies, one folder per marketplace, plugin, and version.
 * - `installed-plugins`: installed plugin folders not split by version.
 * - `local-plugins`: a folder the harness scans for plugins under development.
 * - `marketplaces`: marketplace checkouts.
 * - `install-record`: the file that records which plugins are installed.
 * - `enabled-record`: the user-level file that records which plugins are enabled.
 */
export type PluginStorageKind =
	| 'plugin-cache'
	| 'installed-plugins'
	| 'local-plugins'
	| 'marketplaces'
	| 'install-record'
	| 'enabled-record'

export interface PluginStorageLocation {
	readonly kind: PluginStorageKind
	readonly path: string
	readonly description: string
	/** The claim ID in `.research/harness-detection/evidence.md` that backs this location. */
	readonly research: string
}

export interface PluginStorage {
	readonly harness: HarnessId
	/** The harness's user-level config directory, after any override environment variable. */
	readonly configDir: string
	readonly locations: readonly PluginStorageLocation[]
}

/**
 * Where a harness keeps plugins at the user level. Paths are computed, not checked: a location may
 * not exist until the first plugin is installed.
 */
export function pluginStorage(harness: HarnessId, environment: HarnessEnvironment = {}): PluginStorage {
	return storages[harness](resolveHarnessEnvironment(environment))
}

/** `$XDG_CONFIG_HOME`, else `~/.config`, as the `xdg-basedir` package resolves it. */
const xdgConfig = ({ env, homedir }: ResolvedHarnessEnvironment) => env.XDG_CONFIG_HOME || join(homedir, '.config')

/** The agent plugin folder of the stable VS Code build, per OS (E-VSC-P3). */
function vscodeAgentPlugins({ env, homedir, platform }: ResolvedHarnessEnvironment) {
	if (platform === 'win32') {
		const configDir = win32.join(env.APPDATA || win32.join(homedir, 'AppData', 'Roaming'), 'Code')
		return { configDir, path: win32.join(configDir, 'agentPlugins') }
	}
	const configDir =
		platform === 'darwin' ? join(homedir, 'Library', 'Application Support', 'Code') : join(homedir, '.config', 'Code')
	return { configDir, path: join(configDir, 'agentPlugins') }
}

const storages: Record<HarnessId, (environment: ResolvedHarnessEnvironment) => PluginStorage> = {
	'claude-code': ({ env, homedir }) => {
		const configDir = env.CLAUDE_CONFIG_DIR || join(homedir, '.claude')
		const plugins = join(configDir, 'plugins')
		return {
			harness: 'claude-code',
			configDir,
			locations: [
				{
					kind: 'plugin-cache',
					path: join(plugins, 'cache'),
					description: 'Installed plugins as <marketplace>/<plugin>/<version>/',
					research: 'E-CC-P1',
				},
				{
					kind: 'marketplaces',
					path: join(plugins, 'marketplaces'),
					description: 'Marketplace checkouts',
					research: 'E-CC-P1',
				},
				{
					kind: 'install-record',
					path: join(plugins, 'installed_plugins.json'),
					description: 'Installs keyed by plugin@marketplace, each with scope, installPath, and version',
					research: 'E-CC-P2',
				},
				{
					kind: 'enabled-record',
					path: join(configDir, 'settings.json'),
					description: 'User settings; enabledPlugins maps plugin@marketplace to a boolean',
					research: 'E-CC-P3',
				},
			],
		}
	},
	cursor: ({ homedir }) => {
		// The shipped CLI builds these from the home directory, not from a config-dir override.
		const configDir = join(homedir, '.cursor')
		return {
			harness: 'cursor',
			configDir,
			locations: [
				{
					kind: 'local-plugins',
					path: join(configDir, 'plugins', 'local'),
					description: 'Plugins under development, one folder each',
					research: 'E-CUR-P2',
				},
				{
					kind: 'marketplaces',
					path: join(configDir, 'plugins', 'marketplaces'),
					description: 'Marketplace checkouts',
					research: 'E-CUR-P3',
				},
			],
		}
	},
	codex: ({ env, homedir }) => {
		const configDir = env.CODEX_HOME || join(homedir, '.codex')
		return {
			harness: 'codex',
			configDir,
			locations: [
				{
					kind: 'plugin-cache',
					path: join(configDir, 'plugins', 'cache'),
					description: 'Installed plugins as <marketplace>/<plugin>/<version>/',
					research: 'E-CODEX-P3',
				},
				{
					kind: 'enabled-record',
					path: join(configDir, 'config.toml'),
					description: 'User config; [plugins."<plugin>@<marketplace>"] tables carry enabled = <bool>',
					research: 'E-CODEX-P2',
				},
			],
		}
	},
	'copilot-cli': ({ env, homedir }) => {
		const configDir = env.COPILOT_HOME || join(homedir, '.copilot')
		return {
			harness: 'copilot-cli',
			configDir,
			locations: [
				{
					kind: 'installed-plugins',
					path: join(configDir, 'installed-plugins'),
					description: 'Installed plugins as <marketplace>/<plugin>/, or _direct/<source-id>/ for direct installs',
					research: 'E-COPILOT-P9',
				},
				{
					kind: 'install-record',
					path: join(configDir, 'config.json'),
					description: 'Application state, including installedPlugins',
					research: 'E-COPILOT-P9',
				},
				{
					kind: 'enabled-record',
					path: join(configDir, 'settings.json'),
					description: 'User settings (JSON with comments); enabledPlugins maps plugin specs to a boolean',
					research: 'E-COPILOT-P4',
				},
			],
		}
	},
	opencode: (environment) => {
		const configDir = join(xdgConfig(environment), 'opencode')
		return {
			harness: 'opencode',
			configDir,
			locations: [
				{
					kind: 'local-plugins',
					path: join(configDir, 'plugins'),
					description: 'JS/TS plugin modules loaded at startup; npm plugins are named in the plugin config array',
					research: 'E-OC-P2',
				},
			],
		}
	},
	kilo: (environment) => {
		const configDir = join(xdgConfig(environment), 'kilo')
		return {
			harness: 'kilo',
			configDir,
			locations: [
				{
					kind: 'local-plugins',
					path: join(configDir, 'plugin'),
					description: 'JS/TS plugin modules loaded at startup; npm plugins are named in the plugin config array',
					research: 'E-KILO-P2',
				},
			],
		}
	},
	'gemini-cli': ({ env, homedir }) => {
		const configDir = join(env.GEMINI_CLI_HOME || homedir, '.gemini')
		const extensions = join(configDir, 'extensions')
		return {
			harness: 'gemini-cli',
			configDir,
			locations: [
				{
					kind: 'installed-plugins',
					path: extensions,
					description: 'Installed extensions, one folder each with a gemini-extension.json manifest',
					research: 'E-GEM-P1',
				},
				{
					kind: 'enabled-record',
					path: join(extensions, 'extension-enablement.json'),
					description: 'Per-extension path-glob overrides that enable or disable it by folder, not a boolean',
					research: 'E-GEM-P3',
				},
			],
		}
	},
	'qwen-code': ({ env, homedir }) => {
		const configDir = env.QWEN_HOME || join(homedir, '.qwen')
		const extensions = join(configDir, 'extensions')
		return {
			harness: 'qwen-code',
			configDir,
			locations: [
				{
					kind: 'installed-plugins',
					path: extensions,
					description: 'Installed extensions, one folder each with a qwen-extension.json manifest',
					research: 'E-QWEN-P1',
				},
				{
					kind: 'enabled-record',
					path: join(extensions, 'extension-enablement.json'),
					description: "Extension enable/disable state, inherited from Gemini CLI's format",
					research: 'E-QWEN-P2',
				},
			],
		}
	},
	'vscode-copilot': (environment) => {
		const { configDir, path } = vscodeAgentPlugins(environment)
		return {
			harness: 'vscode-copilot',
			configDir,
			locations: [
				{
					kind: 'installed-plugins',
					path,
					description: 'Installed agent plugins as <host>/<org>/<repo>/',
					research: 'E-VSC-P3',
				},
			],
		}
	},
	cline: ({ homedir }) => {
		// CLINE_DATA_DIR is documented without saying which folder it replaces, so it is not applied.
		const configDir = join(homedir, '.cline')
		return {
			harness: 'cline',
			configDir,
			locations: [
				{
					kind: 'installed-plugins',
					path: join(configDir, 'plugins', '_installed'),
					description: 'Installed plugins, grouped by source: npm, git, remote, or local',
					research: 'E-CLINE-P3',
				},
			],
		}
	},
	crush: ({ env, homedir }) => {
		// Crush has no plugin system; it extends through MCP servers, skills, and hooks in crush.json.
		const configDir = env.CRUSH_GLOBAL_CONFIG || join(env.XDG_CONFIG_HOME || join(homedir, '.config'), 'crush')
		return { harness: 'crush', configDir, locations: [] }
	},
	openhands: ({ env, homedir }) => {
		// The SDK reads OH_PERSISTENCE_DIR; the OpenHands CLI reads OPENHANDS_PERSISTENCE_DIR (E-OH-P2).
		const configDir = env.OH_PERSISTENCE_DIR || env.OPENHANDS_PERSISTENCE_DIR || join(homedir, '.openhands')
		const installed = join(configDir, 'plugins', 'installed')
		return {
			harness: 'openhands',
			configDir,
			locations: [
				{
					kind: 'installed-plugins',
					path: installed,
					description: 'Installed plugins, one folder each',
					research: 'E-OH-P3',
				},
				{
					kind: 'enabled-record',
					path: join(installed, '.installed.json'),
					description: 'Install metadata keyed by plugin name, each with enabled: <bool>',
					research: 'E-OH-P4',
				},
			],
		}
	},
	augment: ({ homedir }) => {
		// The Auggie CLI has no environment override for ~/.augment, only a CLI flag (E-AUG-P1).
		const configDir = join(homedir, '.augment')
		return {
			harness: 'augment',
			configDir,
			locations: [
				{
					kind: 'marketplaces',
					path: join(configDir, 'plugins', 'marketplaces'),
					description: 'Marketplace checkouts',
					research: 'E-AUG-P2',
				},
				{
					kind: 'enabled-record',
					path: join(configDir, 'settings.json'),
					description: 'User settings; enabledPlugins maps plugin@marketplace to a boolean',
					research: 'E-AUG-P4',
				},
			],
		}
	},
}
