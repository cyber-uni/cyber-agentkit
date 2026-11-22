import { accessSync, constants, statSync } from 'node:fs'
import { join, posix, win32 } from 'node:path'
import type { HarnessId } from '../harness/harness-id.js'
import { harnessIds } from '../harness/harness-id.js'
import type { Platform } from '../harness/platform.js'
import { headlessInvocation } from '../headless/headless-invocation.js'
import { type DeclaredHarnessesOptions, declaredHarnesses, type RejectedDeclaration } from './declared-harnesses.js'
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
	/** The repo's or the user's `harnesses` reference lists it (`declaredHarnesses()`); no signal is needed. */
	| 'declared'

export interface PresentHarness {
	readonly harness: HarnessId
	/** The first of `sources`: how it is detected, or `declared` when it is only declared. */
	readonly source: PresentHarnessSource
	/** Every way it was found, detected sources first, so a harness detected and declared lists both. */
	readonly sources: readonly PresentHarnessSource[]
	/** The environment variables, the executable path, or the declaring files that showed it. */
	readonly evidence: readonly string[]
}

export interface PresentHarnessesOptions extends InstalledHarnessesOptions, DeclaredHarnessesOptions {
	/**
	 * `false` (the default) returns only the running harness, or none when it is `unknown`. `true` adds every
	 * harness whose environment signals are set, every harness installed on this machine, and every declared one.
	 */
	readonly all?: boolean | undefined
}

export interface PresentHarnessesResult {
	/** The harness running this process, as `detectHarness()` reports it. */
	readonly running: HarnessId | 'unknown'
	/** The harnesses to act for, the running one first, each once. */
	readonly harnesses: readonly PresentHarness[]
	/** With `all`, declaration entries that are not harness IDs, or files that are not declarations. Absent when none. */
	readonly rejected?: readonly RejectedDeclaration[]
}

/**
 * The harnesses present here: by default the one running this process; with `all`, also every harness whose
 * environment signals are set, every harness installed on this machine (`installedHarnesses()`), and every harness
 * the repo or the user declares (`declaredHarnesses()`).
 */
export function presentHarnesses({
	env = process.env,
	platform,
	all = false,
	root,
	cwd,
	home,
}: PresentHarnessesOptions = {}): PresentHarnessesResult {
	const detection = detectHarness({ env })
	const harnesses: { harness: HarnessId; sources: PresentHarnessSource[]; evidence: string[] }[] = []
	const add = (harness: HarnessId, source: PresentHarnessSource, evidence: readonly string[]) => {
		const found = harnesses.find((present) => present.harness === harness)
		if (!found) harnesses.push({ harness, sources: [source], evidence: [...evidence] })
		else if (source === 'declared') {
			found.sources.push(source)
			found.evidence.push(...evidence)
		}
	}
	const signals = (harness: HarnessId) =>
		detection.evidence.filter((evidence) => evidence.harness === harness).map(({ signal }) => signal)
	if (detection.harness !== 'unknown') add(detection.harness, 'running', signals(detection.harness))
	let rejected: readonly RejectedDeclaration[] = []
	if (all) {
		for (const harness of detection.candidates) add(harness, 'environment', signals(harness))
		for (const { harness, path } of installedHarnesses({ env, platform })) add(harness, 'installed', [path])
		const declared = declaredHarnesses({ root, cwd, home })
		for (const { harness, evidence } of declared.harnesses) add(harness, 'declared', evidence)
		rejected = declared.rejected
	}
	return {
		running: detection.harness,
		harnesses: harnesses.map(({ harness, sources, evidence }) => ({
			harness,
			source: sources[0] as PresentHarnessSource,
			sources,
			evidence,
		})),
		...(rejected.length ? { rejected } : {}),
	}
}
