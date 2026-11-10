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
				default: () => app,
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

		expect(await run(['node', 'cyber-agentkit', 'reference', 'load', 'probe', '--root', root])).toBe(0)
		expect(stdout).toHaveBeenCalledWith('# Probe\n')
	})

	it('reads the references of the host it is given, as the skill script passes its own', async () => {
		const host = tempRoot()
		mkdirSync(join(host, 'references'), { recursive: true })
		writeFileSync(join(host, 'references', 'host-probe.md'), '## Host\n')

		const args = ['node', 'reference.mjs', 'reference', 'load', 'host-probe', '--root', tempRoot()]
		expect(await run(args, { name: 'host-plugin', version: '9.9.9', root: host })).toBe(0)
		expect(stdout).toHaveBeenCalledWith('## Host\n')
	})

	it('names its own plugin layer after the plugin, not the npm package', async () => {
		expect(
			await run(['node', 'cyber-agentkit', 'reference', 'list', '--trace', '--format', 'json', '--root', tempRoot()]),
		).toBe(0)
		const { layers } = JSON.parse(String(stdout.mock.calls[0]?.[0])) as { layers: { plugin: string }[] }
		expect(layers.map(({ plugin }) => plugin)).toContain('cyber-agentkit')
	})

	it('exits 0 when load answers a name not found, holding its status and code', async () => {
		expect(await run(['node', 'cyber-agentkit', 'reference', 'load', 'absent', '--root', tempRoot()])).toBe(0)
		expect(String(stdout.mock.calls[0]?.[0])).toMatch(
			/^<reference name="absent" status="missing" code="reference-missing">.*<\/reference>\n$/,
		)
	})

	it('returns the exit code a failing subcommand gives, with its error value on stdout', async () => {
		const argv = ['node', 'cyber-agentkit', 'reference', 'implementations', 'nope', '--root', tempRoot()]
		expect(await run(argv)).toBe(1)
		expect(stdout).toHaveBeenCalledTimes(1)
		expect(String(stdout.mock.calls[0]?.[0])).toMatch(/^error: .*\ncode: interface-unknown\n/)
		expect(stderr).not.toHaveBeenCalled()
	})

	it.each([
		[['load', '--bogus', 'name'], 'unknown flag'],
		[['where'], 'no name'],
	])('exits 2 with one coded error value on %s (%s)', async (subcommand) => {
		expect(await run(['node', 'cyber-agentkit', 'reference', ...subcommand, '--root', tempRoot()])).toBe(2)
		expect(stdout).toHaveBeenCalledTimes(1)
		expect(String(stdout.mock.calls[0]?.[0])).toMatch(/^error: .*\ncode: [a-z-]+\n/)
	})

	it('has no show subcommand', async () => {
		expect(await run(['node', 'cyber-agentkit', 'reference', 'show', 'name', '--root', tempRoot()])).toBe(2)
	})

	it('treats a run that returns no code as a success', async () => {
		expect(await run(['node', 'cyber-agentkit', '--version'])).toBe(0)
	})

	it.each([
		['load', 'name'],
		['list'],
		['search', 'anything'],
		['where', 'name'],
		['create', 'name'],
		['customize', 'name', '--extends', 'a'],
		['delete', 'name'],
	])('rejects an unsupported --format on %s as a usage error, before the command runs', async (...subcommand) => {
		const argv = ['node', 'cyber-agentkit', 'reference', ...subcommand, '--format', 'yaml', '--root', tempRoot()]
		expect(await run(argv)).toBe(2)
		// clibuilder 12 reports a usage error once, coded, on stdout.
		expect(stdout).toHaveBeenCalledTimes(1)
		expect(String(stdout.mock.calls[0]?.[0])).toContain('code: invalid-value')
	})

	it('reports a failure the parser throws on stderr, as a usage error', async () => {
		thrown.value = new Error('bad argv')
		expect(await run(['node', 'cyber-agentkit', 'reference', 'list'])).toBe(2)
		expect(stderr).toHaveBeenCalledWith('error: bad argv\n')

		thrown.value = 'not an error'
		expect(await run(['node', 'cyber-agentkit', 'reference', 'list'])).toBe(2)
		expect(stderr).toHaveBeenCalledWith('error: Invalid command.\n')
	})
})

describe('bare invocation', () => {
	it('shows the harness and the commands as live data, not a usage error', async () => {
		expect(await run(['node', 'cyber-agentkit'])).toBe(0)
		const out = stdout.mock.calls.map(([chunk]) => String(chunk)).join('')
		expect(out).toContain('bin: cyber-agentkit')
		expect(out).toContain('harness:')
		expect(out).toContain('commands[4]: reference,asset,prose-update,skill')
	})
})
