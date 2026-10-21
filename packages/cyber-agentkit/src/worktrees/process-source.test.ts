import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { procfsProcessSource } from './process-source.js'

// The real /proc, not a fixture: the parsing claims here are about the kernel's own formats.
describe.runIf(process.platform === 'linux')('procfsProcessSource', () => {
	let dir: string | undefined
	let child: ChildProcess | undefined

	afterEach(async () => {
		child?.kill()
		if (dir) await rm(dir, { recursive: true, force: true })
	})

	it("reads a process's parent, executable, argv, cwd, and environment", async () => {
		dir = await realpath(await mkdtemp(join(tmpdir(), 'agent-harness-proc-')))
		child = spawn('sleep', ['30'], { cwd: dir, env: { PROBE_MARK: 'x=1' }, stdio: 'ignore' })
		await new Promise((resolve) => child!.once('spawn', resolve))

		const processes = await procfsProcessSource()()
		const found = processes?.find((info) => info.pid === child!.pid)
		expect(found).toMatchObject({ ppid: process.pid, argv: ['sleep', '30'], cwd: dir, env: { PROBE_MARK: 'x=1' } })
		expect(found?.exe).toMatch(/sleep$|coreutils$/)
	})

	it('returns null when the proc root cannot be read', async () => {
		expect(await procfsProcessSource('/nonexistent-proc')()).toBeNull()
	})
})
