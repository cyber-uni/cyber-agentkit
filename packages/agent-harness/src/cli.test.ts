import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from './cli.js'

/** What `parse` throws on the next run; clibuilder reports a bad argv itself rather than throwing. */
const thrown = vi.hoisted(() => ({ value: undefined as unknown }))

vi.mock('clibuilder', async (importOriginal) => {
	const actual = await importOriginal<typeof import('clibuilder')>()
	return {
		...actual,
		cli: (...args: Parameters<typeof actual.cli>) => {
			if (thrown.value === undefined) return actual.cli(...args)
			const app = {
				command: () => app,
				parse: async () => {
					throw thrown.value
				},
			}
			return app
		},
	}
})

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

afterEach(() => {
	thrown.value = undefined
	stdout.mockClear()
	stderr.mockClear()
	process.exitCode = undefined
})

function tempRoot(): string {
	return mkdtempSync(join(tmpdir(), 'reference-cli-'))
}

describe('run', () => {
	it('runs a reference subcommand under reference', async () => {
		const root = tempRoot()
		mkdirSync(join(root, '.agents', 'references'), { recursive: true })
		writeFileSync(join(root, '.agents', 'references', 'probe.md'), '# Probe\n')

		expect(await run(['node', 'agent-harness', 'reference', 'show', 'probe', '--root', root])).toBe(0)
		expect(stdout).toHaveBeenCalledWith('# Probe\n')
	})

	it('reads the references of the host it is given, as the skill script passes its own', async () => {
		const host = tempRoot()
		mkdirSync(join(host, 'references'), { recursive: true })
		writeFileSync(join(host, 'references', 'host-probe.md'), '## Host\n')

		const args = ['node', 'reference.mjs', 'reference', 'show', 'host-probe', '--root', tempRoot()]
		expect(await run(args, { name: 'host-plugin', version: '9.9.9', root: host })).toBe(0)
		expect(stdout).toHaveBeenCalledWith('## Host\n')
	})

	it('names its own plugin layer after the plugin, not the npm package', async () => {
		expect(await run(['node', 'agent-harness', 'reference', 'list', '--format', 'json', '--root', tempRoot()])).toBe(0)
		const { layers } = JSON.parse(String(stdout.mock.calls[0]?.[0])) as { layers: { plugin: string }[] }
		expect(layers.map(({ plugin }) => plugin)).toContain('cyber-agent-harness')
	})

	it('returns the exit code a failing subcommand gives', async () => {
		expect(await run(['node', 'agent-harness', 'reference', 'show', 'absent', '--root', tempRoot()])).toBe(1)
	})

	it('treats a run that returns no code as a success', async () => {
		expect(await run(['node', 'agent-harness', '--version'])).toBe(0)
	})

	it.each([
		['show', 'name'],
		['list'],
		['search', 'anything'],
		['where', 'name'],
		['create', 'name'],
		['delete', 'name'],
	])('rejects an unsupported --format on %s as a usage error, before the command runs', async (...subcommand) => {
		const argv = ['node', 'agent-harness', 'reference', ...subcommand, '--format', 'yaml', '--root', tempRoot()]
		expect(await run(argv)).toBe(2)
		// clibuilder 12 reports a usage error once, coded, on stdout.
		expect(stdout).toHaveBeenCalledTimes(1)
		expect(String(stdout.mock.calls[0]?.[0])).toContain('code: invalid-value')
	})

	it('reports a failure the parser throws on stderr, as a usage error', async () => {
		thrown.value = new Error('bad argv')
		expect(await run(['node', 'agent-harness', 'reference', 'list'])).toBe(2)
		expect(stderr).toHaveBeenCalledWith('error: bad argv\n')

		thrown.value = 'not an error'
		expect(await run(['node', 'agent-harness', 'reference', 'list'])).toBe(2)
		expect(stderr).toHaveBeenCalledWith('error: Invalid command.\n')
	})
})
