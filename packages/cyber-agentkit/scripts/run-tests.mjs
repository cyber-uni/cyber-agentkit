#!/usr/bin/env node
/**
 * Runs the package's vitest suite with every temp file it makes confined to one run folder.
 *
 * Fixtures call `mkdtemp(join(tmpdir(), ...))` and never remove what they make, and vitest keeps its
 * own `<nanoid>/ssr` module cache under `tmpdir()` that its main process does not clear. Left alone,
 * a run adds thousands of entries to the OS temp dir until it runs out of inodes (issue #298).
 *
 * This script points `TMPDIR`, `TMP` and `TEMP` at a fresh folder before vitest starts, so every
 * `os.tmpdir()` call in the run, and in vitest itself, lands there. It removes that folder when the
 * run ends, whatever the outcome, and then fails if the OS temp dir holds more entries than it did
 * before the run. Extra arguments are passed to vitest.
 */

import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const VITEST_ARGS = ['run', 'src']

/** Counts the entries directly under the OS temp dir. */
export async function countTempEntries(dir = tmpdir()) {
	return (await readdir(dir)).length
}

/** Runs vitest with the temp dir set to `sandbox`, resolves with its exit code. */
export function runVitest(sandbox, args) {
	const env = { ...process.env, TMPDIR: sandbox, TMP: sandbox, TEMP: sandbox }
	return new Promise((resolve, reject) => {
		const child = spawn('vitest', [...VITEST_ARGS, ...args], { stdio: 'inherit', env })
		const forward = (signal) => () => child.kill(signal)
		const onInt = forward('SIGINT')
		const onTerm = forward('SIGTERM')
		process.on('SIGINT', onInt)
		process.on('SIGTERM', onTerm)
		child.on('error', reject)
		child.on('exit', (code, signal) => {
			process.off('SIGINT', onInt)
			process.off('SIGTERM', onTerm)
			resolve(signal ? 1 : (code ?? 1))
		})
	})
}

async function main() {
	const before = await countTempEntries()
	const sandbox = await mkdtemp(join(tmpdir(), 'cyber-agentkit-test-'))
	let code
	try {
		code = await runVitest(sandbox, process.argv.slice(2))
	} finally {
		await rm(sandbox, { recursive: true, force: true })
	}
	const after = await countTempEntries()
	if (after > before) {
		console.error(
			`tests left ${after - before} entries in the OS temp dir (${before} before, ${after} after); ` +
				'a test is writing outside the run folder or not cleaning up',
		)
		return code || 1
	}
	return code
}

if (import.meta.url === `file://${process.argv[1]}`) {
	process.exitCode = await main()
}
