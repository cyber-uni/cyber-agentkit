import { posix, win32 } from 'node:path'

import type { HarnessId } from '../harness/harness-id.js'
import type { Platform } from '../harness/platform.js'

/**
 * Where a piece of managed (organization-enforced) policy lives.
 *
 * - `file` / `directory`: on the local disk; a caller can read it.
 * - `macos-managed-preferences`: a macOS managed-preferences domain delivered by MDM.
 * - `windows-registry`: a Windows registry key delivered by MDM or Group Policy.
 * - `server`: held by the vendor or the organization and fetched at runtime; not readable locally.
 */
export type ManagedPolicyKind = 'file' | 'directory' | 'macos-managed-preferences' | 'windows-registry' | 'server'

export interface ManagedPolicyLocation {
	readonly kind: ManagedPolicyKind
	/** A path, preference domain, registry key, or, for `server`, a description of where it is held. */
	readonly location: string
	readonly description: string
	/** The claim ID in `.research/harness-detection/evidence.md` that backs this location. */
	readonly research: string
}

export interface ManagedPolicyOptions {
	/** Defaults to `process.platform`. */
	readonly platform?: Platform
	/** Used for `%ProgramFiles%` / `%ProgramData%` on Windows. Defaults to `process.env`. */
	readonly env?: Readonly<Record<string, string | undefined>>
}

/**
 * List where a harness keeps managed policy on the given platform, most authoritative first where
 * the vendor documents an order. Server-side locations are included so a caller knows the local
 * files are not the whole picture.
 */
export function managedPolicyLocations(
	harness: HarnessId,
	options: ManagedPolicyOptions = {},
): readonly ManagedPolicyLocation[] {
	const platform = options.platform ?? process.platform
	const env = options.env ?? process.env
	return locators[harness](platform, env)
}

type Env = Readonly<Record<string, string | undefined>>
type Locator = (platform: Platform, env: Env) => ManagedPolicyLocation[]

const joinFor = (platform: Platform) => (platform === 'win32' ? win32.join : posix.join)
const dirnameFor = (platform: Platform) => (platform === 'win32' ? win32.dirname : posix.dirname)

/**
 * OpenCode and Kilo Code: a managed config folder per OS, outranked by the macOS managed-preferences
 * domain, which Kilo Code did not rename (E-OC-M1, E-KILO-M2).
 */
function opencodeFamily(
	platform: Platform,
	env: Env,
	app: string,
	research: { readonly directory: string; readonly preferences: string },
): ManagedPolicyLocation[] {
	const directory = {
		darwin: `/Library/Application Support/${app}`,
		linux: `/etc/${app}`,
		win32: win32.join(env.ProgramData ?? 'C:\\ProgramData', app),
	}[platform as string]
	return [
		...when(platform === 'darwin', {
			kind: 'macos-managed-preferences',
			location: 'ai.opencode.managed',
			description: 'MDM configuration profile; outranks the managed config folder',
			research: research.preferences,
		}),
		...when(directory !== undefined, {
			kind: 'directory',
			location: directory ?? '',
			description: 'Managed config files; outrank user and project config',
			research: research.directory,
		}),
	]
}

/**
 * Gemini CLI and Qwen Code: a system settings file that outranks user settings, and a
 * system-defaults file beside it that user settings override. Each path has an override variable.
 */
function geminiFamily(
	platform: Platform,
	env: Env,
	names: {
		readonly settingsVariable: string
		readonly defaultsVariable: string
		readonly dirs: Readonly<Record<'darwin' | 'linux' | 'win32', string>>
		readonly research: string
	},
): ManagedPolicyLocation[] {
	const dir = platform === 'darwin' || platform === 'win32' ? names.dirs[platform] : names.dirs.linux
	const settings = env[names.settingsVariable] || joinFor(platform)(dir, 'settings.json')
	const defaults =
		env[names.defaultsVariable] || joinFor(platform)(dirnameFor(platform)(settings), 'system-defaults.json')
	return [
		{
			kind: 'file',
			location: settings,
			description: `System settings; outrank user and workspace settings. ${names.settingsVariable} overrides the path`,
			research: names.research,
		},
		{
			kind: 'file',
			location: defaults,
			description: `System defaults; user and workspace settings override them. ${names.defaultsVariable} overrides the path`,
			research: names.research,
		},
	]
}

/** Include `items` only when `condition` holds. */
const when = (condition: boolean, ...items: ManagedPolicyLocation[]) => (condition ? items : [])

const locators: Record<HarnessId, Locator> = {
	'claude-code': (platform) => {
		const dir = {
			darwin: '/Library/Application Support/ClaudeCode',
			linux: '/etc/claude-code',
			win32: 'C:\\Program Files\\ClaudeCode',
		}[platform as string]
		const join = joinFor(platform)
		return [
			{
				kind: 'server',
				location: 'claude.ai admin console or a self-hosted Claude apps gateway',
				description: 'Server-managed settings; the highest-ranked managed source',
				research: 'E-CC-M6',
			},
			...when(platform === 'darwin', {
				kind: 'macos-managed-preferences',
				location: 'com.anthropic.claudecode',
				description: 'MDM configuration profile with the same top-level keys as managed-settings.json',
				research: 'E-CC-M6',
			}),
			...when(platform === 'win32', {
				kind: 'windows-registry',
				location: 'HKLM\\SOFTWARE\\Policies\\ClaudeCode',
				description: 'MDM or Group Policy; the Settings value holds managed-settings JSON',
				research: 'E-CC-M6',
			}),
			...when(
				dir !== undefined,
				{
					kind: 'file',
					location: join(dir ?? '', 'managed-settings.json'),
					description: 'Managed settings, same shape as settings.json',
					research: 'E-CC-M1',
				},
				{
					kind: 'directory',
					location: join(dir ?? '', 'managed-settings.d'),
					description: 'Drop-in managed settings files, merged with managed-settings.json',
					research: 'E-CC-M1',
				},
				{
					kind: 'file',
					location: join(dir ?? '', 'managed-mcp.json'),
					description: 'Managed MCP servers',
					research: 'E-CC-M1',
				},
			),
			...when(platform === 'win32', {
				kind: 'windows-registry',
				location: 'HKCU\\SOFTWARE\\Policies\\ClaudeCode',
				description: 'User-writable; used only when no other managed source delivers a policy key',
				research: 'E-CC-M6',
			}),
		]
	},
	cursor: (platform) => {
		const file = {
			darwin: '/Library/Application Support/Cursor/hooks.json',
			linux: '/etc/cursor/hooks.json',
			win32: 'C:\\ProgramData\\Cursor\\hooks.json',
		}[platform as string]
		return [
			...when(file !== undefined, {
				kind: 'file',
				location: file ?? '',
				description: 'Enterprise hooks deployed by MDM; hooks only, not other enterprise settings',
				research: 'E-CUR-M1',
			}),
			{
				kind: 'server',
				location: 'Cursor dashboard',
				description: 'Team hooks and other enterprise settings, synced from the dashboard',
				research: 'E-CUR-M1',
			},
		]
	},
	codex: (platform, env) => {
		const cloud: ManagedPolicyLocation = {
			kind: 'server',
			location: 'ChatGPT workspace admin settings',
			description: 'Cloud-managed requirements; outrank every local source',
			research: 'E-CODEX-M8',
		}
		if (platform === 'win32') {
			return [
				cloud,
				{
					kind: 'file',
					location: win32.join(env.ProgramData ?? 'C:\\ProgramData', 'OpenAI', 'Codex', 'requirements.toml'),
					description: 'Admin-enforced requirements users cannot override',
					research: 'E-CODEX-M4',
				},
			]
		}
		return [
			cloud,
			...when(platform === 'darwin', {
				kind: 'macos-managed-preferences',
				location: 'com.openai.codex',
				description: 'MDM keys requirements_toml_base64 (enforced) and config_toml_base64 (managed defaults)',
				research: 'E-CODEX-M6',
			}),
			{
				kind: 'file',
				location: '/etc/codex/requirements.toml',
				description: 'Admin-enforced requirements users cannot override',
				research: 'E-CODEX-M3',
			},
			{
				kind: 'file',
				location: '/etc/codex/managed_config.toml',
				description: 'Managed defaults; a user can override them within a session',
				research: 'E-CODEX-M2',
			},
			{
				kind: 'file',
				location: '/etc/codex/config.toml',
				description: 'System-wide config',
				research: 'E-CODEX-M1',
			},
		]
	},
	'copilot-cli': (platform, env) => {
		const file = {
			darwin: '/Library/Application Support/GitHubCopilot/managed-settings.json',
			linux: '/etc/github-copilot/managed-settings.json',
			win32: win32.join(env.ProgramFiles ?? 'C:\\Program Files', 'GitHubCopilot', 'managed-settings.json'),
		}[platform as string]
		return [
			...when(platform === 'darwin', {
				kind: 'macos-managed-preferences',
				location: 'com.github.copilot',
				description: 'MDM-managed settings; the highest-ranked source',
				research: 'E-COPILOT-M2',
			}),
			...when(platform === 'win32', {
				kind: 'windows-registry',
				location: 'HKLM\\SOFTWARE\\Policies\\GitHubCopilot',
				description: 'MDM-managed settings as REG_SZ values; the highest-ranked source',
				research: 'E-COPILOT-M2',
			}),
			{
				kind: 'server',
				location: "copilot/managed-settings.json in the enterprise's .github-private repository",
				description: 'Server-managed settings, fetched for the signed-in account',
				research: 'E-COPILOT-M3',
			},
			...when(file !== undefined, {
				kind: 'file',
				location: file ?? '',
				description: 'File-based managed settings; on macOS and Linux it must be a root-owned regular file',
				research: 'E-COPILOT-M1',
			}),
		]
	},
	opencode: (platform, env) => [
		...opencodeFamily(platform, env, 'opencode', { directory: 'E-OC-M1', preferences: 'E-OC-M1' }),
		{
			kind: 'server',
			location: 'Remote config at the organization domain /.well-known/opencode',
			description: 'Organization defaults; the lowest-ranked config source, so user config overrides them',
			research: 'E-OC-M2',
		},
	],
	kilo: (platform, env) => opencodeFamily(platform, env, 'kilo', { directory: 'E-KILO-M1', preferences: 'E-KILO-M2' }),
	'gemini-cli': (platform, env) =>
		geminiFamily(platform, env, {
			settingsVariable: 'GEMINI_CLI_SYSTEM_SETTINGS_PATH',
			defaultsVariable: 'GEMINI_CLI_SYSTEM_DEFAULTS_PATH',
			dirs: {
				darwin: '/Library/Application Support/GeminiCli',
				linux: '/etc/gemini-cli',
				win32: 'C:\\ProgramData\\gemini-cli',
			},
			research: 'E-GEM-M1',
		}),
	'qwen-code': (platform, env) =>
		geminiFamily(platform, env, {
			settingsVariable: 'QWEN_CODE_SYSTEM_SETTINGS_PATH',
			defaultsVariable: 'QWEN_CODE_SYSTEM_DEFAULTS_PATH',
			dirs: {
				darwin: '/Library/Application Support/QwenCode',
				linux: '/etc/qwen-code',
				win32: 'C:\\ProgramData\\qwen-code',
			},
			research: 'E-QWEN-M1',
		}),
	'vscode-copilot': (platform) => [
		...when(platform === 'win32', {
			kind: 'windows-registry',
			// The docs give the key without a hive.
			location: 'Software\\Policies\\Microsoft\\VSCode',
			description: 'VS Code policies set by Group Policy (ADMX templates ship with VS Code)',
			research: 'E-VSC-M1',
		}),
		// macOS takes a .mobileconfig profile, but the docs do not name its preference domain (E-VSC-M2).
		...when(platform === 'linux', {
			kind: 'file',
			location: '/etc/vscode/policy.json',
			description: 'VS Code policies as JSON, read by VS Code 1.106 and later',
			research: 'E-VSC-M3',
		}),
	],
	cline: () => [
		{
			kind: 'server',
			location: 'Cline Enterprise admin console',
			description: 'Provider, model, and tool policy pushed to clients; no local policy file is documented',
			research: 'E-CLINE-M1',
		},
	],
	crush: (platform) =>
		when(platform !== 'win32', {
			kind: 'file',
			location: '/etc/crush/crush.json',
			description: 'System config; the lowest-ranked source, so user and project config override it',
			research: 'E-CRUSH-M1',
		}),
	openhands: () => [
		{
			kind: 'server',
			location: 'OpenHands Cloud or Enterprise deployment',
			description: 'Organization controls held server-side; no local policy file is known',
			research: 'E-OH-D8',
		},
	],
	augment: (platform, env) => [
		{
			kind: 'file',
			location:
				platform === 'win32'
					? win32.join(env.ProgramData || 'C:\\ProgramData', 'augment', 'settings.json')
					: '/etc/augment/settings.json',
			description: 'System settings, read from the Auggie CLI bundle; its rank against user settings is not documented',
			research: 'E-AUG-M1',
		},
	],
}
