import { accessSync, constants, statSync } from 'node:fs'
import { join, posix, win32 } from 'node:path'
import type { HarnessId } from '../harness/harness-id.js'
import { harnessIds } from '../harness/harness-id.js'
import type { Platform } from '../harness/platform.js'
import { headlessInvocation } from '../headless/headless-invocation.js'
import { detectHarness } from './detect-harness.js'

type Env = Readonly<Record<string, string | undefined>>

/** A harness whose command is on `PATH`. */
export interface InstalledHarness {
	readonly harness: HarnessId
	/** The executable name, as `headlessInvocation()` records it. */
	readonly executable: string
	/** Where it was found on `PATH`. */
	readonly path: string
	/** What showed the harness is installed: the paths found. */
	readonly evidence: readonly string[]
	/** The claim IDs in `.research/harness-detection/evidence.md` that back the executable's name. */
	readonly research: readonly string[]
}

export interface InstalledHarnessesOptions {
	/** The environment whose `PATH` (and, on Windows, `PATHEXT`) is searched. Defaults to `process.env`. */
	readonly env?: Env | undefined
	readonly platform?: Platform | undefined
}

function isExecutable(path: string, platform: Platform): boolean {
	try {
		if (!statSync(path).isFile()) return false
		if (platform !== 'win32') accessSync(path, constants.X_OK)
		return true
	} catch {
		return false
	}
}

/**
 * The harnesses installed on this machine: those whose verified headless executable (R9) is on `PATH`
 * (`.research/harness-detection/conclusion.md`, R11). The executable is not run.
 *
 * A harness with no verified command is never reported. That includes the Cursor IDE without `cursor-agent`
 * and Copilot in VS Code: every other signal for them, such as a `cursor` or `code` command or an app,
 * user-data, or extension folder, was checked and rejected (E-CUR-N1, E-CUR-N2, E-VSC-N1–N5).
 */
export function installedHarnesses({
	env = process.env,
	platform = process.platform as Platform,
}: InstalledHarnessesOptions = {}): InstalledHarness[] {
	const windows = platform === 'win32'
	const pathValue = env['PATH'] ?? env['Path'] ?? ''
	const dirs = pathValue.split(windows ? win32.delimiter : posix.delimiter).filter(Boolean)
	const extensions = windows ? (env['PATHEXT'] || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : ['']
	const found: InstalledHarness[] = []
	for (const harness of harnessIds) {
		const invocation = headlessInvocation(harness)
		if (invocation.supported !== true) continue
		const { executable, research } = invocation
		const path = dirs
			.flatMap((dir) => extensions.map((ext) => join(dir, `${executable}${ext}`)))
			.find((candidate) => isExecutable(candidate, platform))
		if (path) found.push({ harness, executable, path, evidence: [path], research })
	}
	return found
}

/** How a harness came to be checked. */
export type PresentHarnessSource =
	/** The one harness `detectHarness()` reports running this process. */
	| 'running'
	/** One of several harnesses whose environment signals are set (nested sessions), which leave `running` unknown. */
	| 'environment'
	/** Its command is on `PATH` (R11). */
	| 'installed'

export interface PresentHarness {
	readonly harness: HarnessId
	readonly source: PresentHarnessSource
	/** The environment variables or the executable path that showed it. */
	readonly evidence: readonly string[]
}

export interface PresentHarnessesOptions extends InstalledHarnessesOptions {
	/**
	 * `false` (the default) returns only the running harness, or none when it is `unknown`. `true` adds every
	 * harness whose environment signals are set and every harness installed on this machine.
	 */
	readonly all?: boolean | undefined
}

export interface PresentHarnessesResult {
	/** The harness running this process, as `detectHarness()` reports it. */
	readonly running: HarnessId | 'unknown'
	/** The harnesses to act for, the running one first, each once. */
	readonly harnesses: readonly PresentHarness[]
}

/**
 * The harnesses present here: by default the one running this process; with `all`, also every harness whose
 * environment signals are set and every harness installed on this machine (`installedHarnesses()`).
 */
export function presentHarnesses({
	env = process.env,
	platform,
	all = false,
}: PresentHarnessesOptions = {}): PresentHarnessesResult {
	const detection = detectHarness({ env })
	const harnesses: PresentHarness[] = []
	const signals = (harness: HarnessId) =>
		detection.evidence.filter((evidence) => evidence.harness === harness).map(({ signal }) => signal)
	if (detection.harness !== 'unknown')
		harnesses.push({ harness: detection.harness, source: 'running', evidence: signals(detection.harness) })
	if (all) {
		for (const harness of detection.candidates)
			if (!harnesses.some((present) => present.harness === harness))
				harnesses.push({ harness, source: 'environment', evidence: signals(harness) })
		for (const { harness, path } of installedHarnesses({ env, platform }))
			if (!harnesses.some((present) => present.harness === harness))
				harnesses.push({ harness, source: 'installed', evidence: [path] })
	}
	return { running: detection.harness, harnesses }
}
