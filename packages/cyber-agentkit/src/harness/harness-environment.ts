import { homedir } from 'node:os'

import type { Platform } from './platform.js'

/**
 * The parts of the running process a harness query depends on. Every field defaults to the
 * current process, so callers pass them only to inspect another environment (or in tests).
 */
export interface HarnessEnvironment {
	/** Defaults to `process.env`. */
	readonly env?: Readonly<Record<string, string | undefined>>
	/** Defaults to `os.homedir()`. */
	readonly homedir?: string
	/** The project directory, for project-scoped settings. Defaults to `process.cwd()`. */
	readonly cwd?: string
	/** Defaults to `process.platform`. */
	readonly platform?: Platform
}

export type ResolvedHarnessEnvironment = Required<HarnessEnvironment>

export function resolveHarnessEnvironment(environment: HarnessEnvironment = {}): ResolvedHarnessEnvironment {
	return {
		env: environment.env ?? process.env,
		homedir: environment.homedir ?? homedir(),
		cwd: environment.cwd ?? process.cwd(),
		platform: environment.platform ?? process.platform,
	}
}
