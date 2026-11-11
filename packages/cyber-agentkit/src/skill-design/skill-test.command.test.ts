import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli } from 'clibuilder'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { createSkillCommand } from './skill.command.js'
import { goodSkill } from './skill-design.fixtures.js'
import type { PromptfooRun } from './skill-test.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
// A test outside a repository saves under the home folder, so each test gets its own.
let fakeHome = ''
beforeEach(() => {
	fakeHome = mkdtempSync(join(tmpdir(), 'skill-test-home-'))
	vi.stubEnv('HOME', fakeHome)
	vi.stubEnv('USERPROFILE', fakeHome)
})
afterEach(() => {
	stdout.mockClear()
	stderr.mockClear()
	vi.unstubAllEnvs()
})
const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')

/** A fake promptfoo: every run fires and passes every check, and the config it was given is kept. */
function fakeRun(seen: { config?: Record<string, unknown>; provider?: string }, pass = true): PromptfooRun {
	return async (folder, config) => {
		const parsed: Record<string, unknown> = parse(readFileSync(join(folder, config), 'utf8'))
		seen.config = parsed
		seen.provider = readFileSync(join(folder, 'provider.mjs'), 'utf8')
		const tests = parsed['tests'] as { description: string; vars: { kind: string; rubrics: string } }[]
		const results = tests.flatMap((test) =>
			['with-skill', 'baseline'].flatMap((label) =>
				[0, 1, 2].map((repeatIndex) => {
					const ids = Object.keys(JSON.parse(test.vars.rubrics))
					const fired = !/review|commit|summarize/.test(JSON.stringify(test))
					return {
						provider: { label },
						testCase: { description: test.description },
						repeatIndex,
						response: {
							output: 'x',
							metadata: { fired, checks: Object.fromEntries(ids.map((id) => [id, { pass }])) },
						},
						gradingResult: { componentResults: ids.map((metric) => ({ pass, assertion: { metric } })) },
					}
				}),
			),
		)
		return { output: { results: { results } } }
	}
}

async function sub(name: string, folder: string, root: string, run: PromptfooRun = fakeRun({})) {
	const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
		createSkillCommand({ runPromptfoo: run }),
	)
	return app
		.parse<number | undefined>(['node', 'cyber-agentkit', 'skill', name, folder, '--root', root, '--format', 'json'])
		.then((code) => (typeof code === 'number' ? code : 0))
}

async function test(folder: string, run: PromptfooRun, root: string, ...extra: string[]) {
	const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
		createSkillCommand({ runPromptfoo: run }),
	)
	return app
		.parse<number | undefined>([
			'node',
			'cyber-agentkit',
			'skill',
			'test',
			folder,
			'--root',
			root,
			'--format',
			'json',
			...extra,
		])
		.then((code) => (typeof code === 'number' ? code : 0))
}

function repo(): string {
	const root = mkdtempSync(join(tmpdir(), 'skill-test-repo-'))
	readdirSync(root)
	return root
}

describe('skill test', () => {
	it('runs both arms in isolation, saves the result, and compares with the previous one', async () => {
		const skill = goodSkill()
		const root = repo()
		const seen: { config?: Record<string, unknown>; provider?: string } = {}
		await test(skill.folder, fakeRun(seen), root)
		const providers = seen.config?.['providers'] as {
			label: string
			config: { skillDir?: string; inner: Record<string, unknown> }
		}[]
		expect(providers.map((p) => p.label)).toEqual(['with-skill', 'baseline'])
		expect(providers[0]?.config.skillDir).toBe(skill.folder)
		expect(providers[1]?.config.skillDir).toBeUndefined()
		expect(providers[0]?.config.inner).toMatchObject({ setting_sources: ['project'], apiKeyRequired: false })
		expect(seen.config?.['evaluateOptions']).toMatchObject({ repeat: 3 })
		expect(seen.provider).toContain("loadApiProvider('anthropic:claude-agent-sdk'")
		expect(seen.provider).toContain('.skill-test/\\n') // the call log is excluded from git status
		expect(seen.provider).toContain("'skill-calls.jsonl'")

		const saved = join(root, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json')
		expect(existsSync(saved)).toBe(false) // no .git: saved under the home folder instead
		expect(existsSync(join(fakeHome, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json'))).toBe(true)
	})

	it('saves under the repository root, moves the previous result aside, and exits 1 on a failure', async () => {
		const skill = goodSkill()
		const root = repo()
		const { mkdirSync } = await import('node:fs')
		mkdirSync(join(root, '.git'))
		expect(await test(skill.folder, fakeRun({}), root)).toBe(0)
		const folder = join(root, '.agents', 'skill-design', 'results', 'release-notes')
		const first = JSON.parse(readFileSync(join(folder, 'latest.json'), 'utf8'))
		expect(first).toMatchObject({ version: 1, skill: 'release-notes', noPrevious: true, runs: 3, threshold: 2 })
		expect(first.criteria.map((c: { status: string }) => c.status)).toEqual(['pass', 'pass'])

		expect(await test(skill.folder, fakeRun({}, false), root)).toBe(1)
		const second = JSON.parse(readFileSync(join(folder, 'latest.json'), 'utf8'))
		expect(second.changed).toContainEqual({ case: 'two-prs', from: 'pass', to: 'fail' })
		expect(readdirSync(folder)).toHaveLength(2)
	})

	it('loads the plugin a skill is developed in, and the baseline without the skill (R91)', async () => {
		const skill = goodSkill()
		const pluginRoot = join(skill.folder, '..')
		mkdirSync(join(pluginRoot, '.claude-plugin'), { recursive: true })
		writeFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'kit' }))
		const { renameSync } = await import('node:fs')
		mkdirSync(join(pluginRoot, 'skills'), { recursive: true })
		renameSync(skill.folder, join(pluginRoot, 'skills', 'release-notes'))
		const folder = join(pluginRoot, 'skills', 'release-notes')
		const seen: { config?: Record<string, unknown> } = {}
		let copies: boolean[] = []
		const run: PromptfooRun = async (dir, config, output) => {
			const answer = await fakeRun(seen)(dir, config, output)
			const providers = seen.config?.['providers'] as { config: { pluginDir?: string } }[]
			const at = (i: number, path: string) => existsSync(join(providers[i]?.config.pluginDir ?? '/none', path))
			copies = [
				at(0, 'skills/release-notes/SKILL.md'),
				at(1, '.claude-plugin/plugin.json'),
				at(1, 'skills/release-notes'),
			]
			return answer
		}
		expect(await test(folder, run, repo())).toBe(0)
		const providers = seen.config?.['providers'] as { config: Record<string, unknown> }[]
		expect(providers.map((p) => p.config['pluginName'])).toEqual(['kit', 'kit'])
		expect(providers.map((p) => p.config['skillDir'])).toEqual([undefined, undefined])
		expect(copies).toEqual([true, true, false])
		expect(readFileSync(join(folder, 'SKILL.md'), 'utf8')).toContain('name: release-notes')
	})

	it('stops with no-cases before any run when the skill has no evals (R31)', async () => {
		const skill = goodSkill()
		const { rmSync } = await import('node:fs')
		rmSync(join(skill.folder, 'evals'), { recursive: true })
		const run = vi.fn()
		expect(await test(skill.folder, run, repo())).toBe(1)
		expect(run).not.toHaveBeenCalled()
		expect(stderr.mock.calls.join('')).toContain('no-cases')
		expect(printed()).toBe('')
	})

	it('falls back to a run without the skill when the baseline folder holds none (R35)', async () => {
		const seen: { config?: Record<string, unknown> } = {}
		await test(goodSkill().folder, fakeRun(seen), repo(), '--baseline', '/nonexistent')
		expect(stderr.mock.calls.join('')).toContain('holds no SKILL.md')
		const providers = seen.config?.['providers'] as { config: { skillDir?: string } }[]
		expect(providers[1]?.config.skillDir).toBeUndefined()
	})

	describe('expected result', () => {
		const results = (root: string) => join(root, '.agents', 'skill-design', 'results')
		const gitRepo = () => {
			const root = repo()
			mkdirSync(join(root, '.git'))
			return root
		}

		it('makes the results folder ignore itself', async () => {
			const root = gitRepo()
			await test(goodSkill().folder, fakeRun({}), root)
			expect(readFileSync(join(results(root), '.gitignore'), 'utf8')).toBe('*\n')
		})

		it('writes expected.json with --accept, in the shape of latest.json', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			await test(skill.folder, fakeRun({}, false), root)
			expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
			await test(skill.folder, fakeRun({}, false), root, '--accept')
			const { folder, ...latest } = JSON.parse(
				readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'),
			)
			expect(folder).toBeDefined()
			expect(JSON.parse(readFileSync(join(skill.folder, 'evals', 'expected.json'), 'utf8'))).toEqual(latest)
		})

		it('saves the first passing run as expected.json when there is none, and says so (R80)', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			const expected = join(skill.folder, 'evals', 'expected.json')
			expect(await test(skill.folder, fakeRun({}, false), root)).toBe(1)
			expect(existsSync(expected)).toBe(false) // a failing first run saves none
			expect(await test(skill.folder, fakeRun({}), root)).toBe(0)
			expect(printed()).toContain('"savedAsExpected":true')
			const { folder: _folder, ...latest } = JSON.parse(
				readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'),
			)
			expect(latest).not.toHaveProperty('savedAsExpected')
			expect(JSON.parse(readFileSync(expected, 'utf8'))).toEqual(latest)

			const first = readFileSync(expected, 'utf8')
			await test(skill.folder, fakeRun({}), root) // a later pass does not replace it
			expect(readFileSync(expected, 'utf8')).toBe(first)
		})

		it('accepts the last saved result without running, and errors when there is none', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			const run = vi.fn(fakeRun({}))
			expect(await sub('accept', skill.folder, root, run)).toBe(1)
			expect(stderr.mock.calls.join('')).toContain('no-result')
			expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
			await test(skill.folder, fakeRun({}, false), root)
			expect(await sub('accept', skill.folder, root, run)).toBe(0)
			expect(run).not.toHaveBeenCalled()
			const { folder: _folder, ...latest } = JSON.parse(
				readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'),
			)
			expect(JSON.parse(readFileSync(join(skill.folder, 'evals', 'expected.json'), 'utf8'))).toEqual(latest)
		})

		it('compares with the expected result over the previous one, and says which', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			const latest = () => JSON.parse(readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'))
			await test(skill.folder, fakeRun({}), root)
			expect(latest()).toMatchObject({ noPrevious: true })
			expect(latest()).not.toHaveProperty('comparedWith')
			await test(skill.folder, fakeRun({}), root, '--accept') // expected: all pass
			await test(skill.folder, fakeRun({}, false), root) // previous: all pass
			await test(skill.folder, fakeRun({}, false), root) // previous: all fail, expected: all pass
			expect(latest().comparedWith).toBe('expected')
			expect(latest().changed).toContainEqual({ case: 'two-prs', from: 'pass', to: 'fail' })
		})

		it('compares with the previous result when there is no expected one', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			await test(skill.folder, fakeRun({}, false), root)
			await test(skill.folder, fakeRun({}, false), root)
			const second = JSON.parse(readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'))
			expect(second.comparedWith).toBe('previous')
		})
	})

	describe('cleanup', () => {
		const results = (root: string) => join(root, '.agents', 'skill-design', 'results')
		const gitRepo = () => {
			const root = repo()
			mkdirSync(join(root, '.git'))
			return root
		}
		const seed = (root: string, name: string, latest: string | undefined) => {
			const folder = join(results(root), name)
			mkdirSync(folder, { recursive: true })
			if (latest !== undefined) writeFileSync(join(folder, 'latest.json'), latest)
			return folder
		}

		it('keeps latest.json and the 5 most recent past results', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			const folder = seed(root, 'release-notes', undefined)
			for (let day = 1; day <= 8; day++) writeFileSync(join(folder, `2026-01-0${day}T00-00-00.000Z.json`), '{}')
			await test(skill.folder, fakeRun({}), root)
			expect(readdirSync(folder).sort()).toEqual([
				'2026-01-04T00-00-00.000Z.json',
				'2026-01-05T00-00-00.000Z.json',
				'2026-01-06T00-00-00.000Z.json',
				'2026-01-07T00-00-00.000Z.json',
				'2026-01-08T00-00-00.000Z.json',
				'latest.json',
			])
		})

		it('records the skill folder in the saved result', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			await test(skill.folder, fakeRun({}), root)
			const saved = JSON.parse(readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'))
			expect(saved.folder).toBe(skill.folder)
		})

		it('removes the results of a skill whose folder is gone, and keeps the others', async () => {
			const root = gitRepo()
			const live = mkdtempSync(join(tmpdir(), 'skill-live-'))
			const gone = seed(root, 'spike', JSON.stringify({ skill: 'spike', folder: join(tmpdir(), 'skill-vanished-xyz') }))
			const kept = seed(root, 'live', JSON.stringify({ skill: 'live', folder: live }))
			const old = seed(root, 'old', JSON.stringify({ skill: 'old', at: 'x' }))
			const broken = seed(root, 'broken', '{ nope')
			const empty = seed(root, 'empty', undefined)
			await test(goodSkill().folder, fakeRun({}), root)
			expect(existsSync(gone)).toBe(false)
			for (const folder of [kept, old, broken, empty]) expect(existsSync(folder)).toBe(true)
		})

		it('never removes the current skill own results', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			await test(skill.folder, fakeRun({}), root)
			const latest = join(results(root), 'release-notes', 'latest.json')
			const saved = JSON.parse(readFileSync(latest, 'utf8'))
			writeFileSync(latest, JSON.stringify({ ...saved, folder: join(tmpdir(), 'skill-vanished-xyz') }))
			await test(skill.folder, fakeRun({}), root)
			expect(JSON.parse(readFileSync(latest, 'utf8')).folder).toBe(skill.folder)
		})
	})
})

describe('skill test progress (UC6)', () => {
	const gitRepo = () => {
		const root = repo()
		mkdirSync(join(root, '.git'))
		return root
	}
	const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk))
	const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

	async function testWith(folder: string, run: PromptfooRun, root: string, ...extra: string[]) {
		const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
			createSkillCommand({ runPromptfoo: run, progress: { heartbeatMs: 60, pollMs: 10 }, threads: 16 }),
		)
		return app.parse<number | undefined>([
			'node',
			'cyber-agentkit',
			'skill',
			'test',
			folder,
			'--root',
			root,
			'--format',
			'json',
			...extra,
		])
	}

	/** A fake promptfoo that reports its runs the way the provider and the hook do: start lines, then end lines. */
	function reporting(lines: object[][], between = 0): PromptfooRun {
		const inner = fakeRun({})
		return async (folder, config, output) => {
			for (const batch of lines) {
				appendFileSync(join(folder, 'progress.jsonl'), batch.map((line) => `${JSON.stringify(line)}\n`).join(''))
				if (between) await pause(between)
			}
			return inner(folder, config, output)
		}
	}
	const start = (name: string, run: number, t = Date.now(), arm = 'skill') => ({
		event: 'start',
		case: name,
		arm,
		run,
		kind: 'outcome',
		t,
	})
	const end = (name: string, run: number, outcome: string, durationMs: number, arm = 'skill', reason?: string) => ({
		event: 'end',
		case: name,
		arm,
		run,
		kind: 'outcome',
		outcome,
		durationMs,
		t: Date.now(),
		...(reason ? { reason } : {}),
	})

	describe('before the first run (R97)', () => {
		it('says how many runs it will make, counting a trigger case once and an outcome case in both arms', async () => {
			const first = errors()
			await testWith(goodSkill().folder, fakeRun({}), gitRepo())
			expect(first).toEqual([])
			expect(errors()[0]).toBe(
				'skill test: 24 runs (7 cases × 3, outcome cases with and without the skill, trigger cases with it); 7 at once\n',
			)
		})

		it('adds how long and how much the last saved result took, and leaves out what it lacks', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			await testWith(skill.folder, fakeRun({}), root) // no saved result yet
			expect(errors()[0]).not.toContain('last time')
			const latest = join(root, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json')
			const saved = JSON.parse(readFileSync(latest, 'utf8'))
			writeFileSync(latest, JSON.stringify({ ...saved, durationMs: 14 * 60_000, cost: 8.5 }))
			stderr.mockClear()
			await testWith(skill.folder, fakeRun({}), root)
			expect(errors()[0]).toContain('; last time about 14 min, $8.50\n')
			// an older result has a cost and no duration
			writeFileSync(latest, JSON.stringify({ ...saved, durationMs: undefined, cost: 8.5 }))
			stderr.mockClear()
			await testWith(skill.folder, fakeRun({}), root)
			expect(errors()[0]).toContain('; last time about $8.50\n')
			// the last result made a different number of runs, such as a full run before a partial one
			writeFileSync(latest, JSON.stringify({ ...saved, durationMs: 14 * 60_000, cost: 8.5, totalRuns: 75 }))
			stderr.mockClear()
			await testWith(skill.folder, fakeRun({}), root)
			expect(errors()[0]).toContain('; last time 75 runs took about 14 min, $8.50\n')
		})

		it('falls back to the expected result when nothing is saved, and saves how long the run took', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			writeFileSync(
				join(skill.folder, 'evals', 'expected.json'),
				JSON.stringify({ cases: [], cost: 2, durationMs: 90_000 }),
			)
			await testWith(skill.folder, fakeRun({}), root)
			expect(errors()[0]).toContain('; last time about 2 min, $2.00\n')
			const saved = JSON.parse(
				readFileSync(join(root, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json'), 'utf8'),
			)
			expect(saved.durationMs).toBeGreaterThanOrEqual(0)
			expect(saved.totalRuns).toBeGreaterThan(0)
		})
	})

	describe('as each run ends (R98)', () => {
		it('prints one line per ended run with its count, case, run, arm, outcome and time, and never the reply', async () => {
			const run = reporting([
				[start('two-prs', 1), start('two-prs', 2, undefined, 'baseline')],
				[end('two-prs', 1, 'pass', 48_000), end('two-prs', 2, 'fail', 125_000, 'baseline')],
				[end('trigger-1', 3, 'not run', 300_000, 'skill', 'time limit')],
			])
			await testWith(goodSkill().folder, run, gitRepo())
			expect(errors().slice(1)).toEqual([
				'[1/24] two-prs run 1 (with skill): pass, 48s\n',
				'[2/24] two-prs run 2 (without skill): fail, 2m05s\n',
				'[3/24] trigger-1 run 3 (with skill): not run: time limit, 5m00s\n',
			])
			expect(errors().join('')).not.toContain('"x"')
		})

		it('reports fired and not fired for a trigger run, and holds a half-written line until it is whole', async () => {
			const fired = { ...end('trigger-1', 1, 'fired', 4_000), kind: 'trigger' }
			const quiet = { ...end('trigger-4', 1, 'not fired', 3_000), kind: 'trigger' }
			const inner = fakeRun({})
			const run: PromptfooRun = async (folder, config, output) => {
				const file = join(folder, 'progress.jsonl')
				appendFileSync(file, `${JSON.stringify(fired)}\n${JSON.stringify(quiet).slice(0, 20)}`)
				await pause(60)
				appendFileSync(file, `${JSON.stringify(quiet).slice(20)}\n`)
				return inner(folder, config, output)
			}
			await testWith(goodSkill().folder, run, gitRepo())
			expect(errors().slice(1)).toEqual([
				'[1/24] trigger-1 run 1 (with skill): fired, 4s\n',
				'[2/24] trigger-4 run 1 (with skill): not fired, 3s\n',
			])
		})

		it('asks promptfoo for the progress through the provider and an afterEach hook', async () => {
			const seen: { config?: Record<string, unknown> } = {}
			await testWith(goodSkill().folder, fakeRun(seen), gitRepo())
			const providers = seen.config?.['providers'] as { config: { progressFile?: string } }[]
			expect(providers[0]?.config.progressFile).toMatch(/skill-test-.*progress\.jsonl$/)
			expect(providers[1]?.config.progressFile).toBe(providers[0]?.config.progressFile)
			expect(seen.config?.['extensions']).toEqual(['file://./progress-hook.mjs:afterEach'])
		})
	})

	describe('when no run ends (R99)', () => {
		it('says how many runs are in progress and how long the longest has taken, every interval, until one ends', async () => {
			const old = Date.now() - 65_000
			const run = reporting([[start('two-prs', 1, old), start('two-prs', 2, Date.now() - 5_000)]])
			const inner = reporting([])
			await testWith(
				goodSkill().folder,
				async (folder, config, output) => {
					await run(folder, config, output)
					await pause(200)
					appendFileSync(join(folder, 'progress.jsonl'), `${JSON.stringify(end('two-prs', 1, 'pass', 66_000))}\n`)
					return inner(folder, config, output)
				},
				gitRepo(),
			)
			const lines = errors().slice(1)
			const beats = lines.filter((line) => line.startsWith('still running'))
			expect(beats.length).toBeGreaterThanOrEqual(2)
			for (const beat of beats) expect(beat).toMatch(/^still running: 2 runs in progress, longest 1m\d+s\n$/)
			expect(lines.at(-1)).toBe('[1/24] two-prs run 1 (with skill): pass, 1m06s\n')
		})

		it('stays quiet while runs keep ending', async () => {
			const lines = [
				[start('two-prs', 1)],
				[end('two-prs', 1, 'pass', 1000)],
				[start('two-prs', 2)],
				[end('two-prs', 2, 'pass', 1000)],
			]
			await testWith(goodSkill().folder, reporting(lines, 20), gitRepo())
			expect(errors().filter((line) => line.startsWith('still running'))).toEqual([])
		})
	})

	describe('where it goes (R100)', () => {
		it('leaves the result on stdout as it was, with no progress in it', async () => {
			const run = reporting([[start('two-prs', 1)], [end('two-prs', 1, 'pass', 1000)]])
			await testWith(goodSkill().folder, run, gitRepo())
			const withProgress = printed()
			stdout.mockClear()
			await testWith(goodSkill().folder, fakeRun({}), gitRepo(), '--silent')
			const without = printed()
			for (const text of [withProgress, without]) {
				expect(text).not.toContain('[1/24]')
				expect(text).not.toContain('skill test:')
				expect(JSON.parse(text)).toMatchObject({ skill: 'release-notes', runs: 3 })
			}
			expect(Object.keys(JSON.parse(withProgress)).sort()).toEqual(Object.keys(JSON.parse(without)).sort())
		})

		it('prints no progress with --silent', async () => {
			const run = reporting([[start('two-prs', 1)], [end('two-prs', 1, 'pass', 1000)]], 30)
			await testWith(goodSkill().folder, run, gitRepo(), '--silent')
			expect(errors().filter((line) => /skill test:|\[\d+\/|still running/.test(line))).toEqual([])
		})
	})
})

describe('skill test --case (R102)', () => {
	const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
	const gitRepo = () => {
		const root = repo()
		mkdirSync(join(root, '.git'))
		return root
	}
	const latestOf = (root: string) =>
		JSON.parse(readFileSync(join(root, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json'), 'utf8'))

	it('runs only the named cases, outcome IDs or trigger-<n>, and says so in the plan and the result', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		const seen: { config?: Record<string, unknown> } = {}
		expect(await test(skill.folder, fakeRun(seen), root, '--case', 'two-prs', '--case', 'trigger-2')).toBe(0)
		const tests = seen.config?.['tests'] as { description: string }[]
		expect(tests.map((item) => item.description)).toEqual(['trigger-2', 'two-prs'])
		expect(errors()).toContain('skill test: 9 runs (2 cases × 3,')
		const latest = latestOf(root)
		expect(latest.partial).toEqual({ cases: ['trigger-2', 'two-prs'] })
		expect(latest.cases.map((item: { case: string }) => item.case)).toEqual(['trigger-2', 'two-prs'])
		expect(printed()).toContain('"partial":{"cases":["trigger-2","two-prs"]}')
	})

	it('never saves a partial result as the expected result, even a first passing one', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		await test(skill.folder, fakeRun({}), root, '--case', 'two-prs')
		expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
		expect(printed()).not.toContain('savedAsExpected')
		expect(latestOf(root).partial).toBeDefined() // still saved as latest.json
	})

	it('compares with the expected result for the named cases only', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		await test(skill.folder, fakeRun({}), root) // the full pass becomes expected
		stdout.mockClear()
		await test(skill.folder, fakeRun({}, false), root, '--case', 'two-prs')
		const latest = latestOf(root)
		expect(latest.comparedWith).toBe('expected')
		expect(latest.changed).toEqual([{ case: 'two-prs', from: 'pass', to: 'fail' }])
	})

	it('is a usage error for an unknown case ID, and nothing runs', async () => {
		const skill = goodSkill()
		const run = vi.fn(fakeRun({}))
		expect(await test(skill.folder, run, gitRepo(), '--case', 'two-prs', '--case', 'nope', '--case', 'trigger-9')).toBe(
			2,
		)
		expect(run).not.toHaveBeenCalled()
		expect(errors()).toMatch(/unknown-case: no case nope, trigger-9/)
	})

	it('refuses --accept with --case as a usage error, and nothing runs', async () => {
		const skill = goodSkill()
		const run = vi.fn(fakeRun({}))
		expect(await test(skill.folder, run, gitRepo(), '--case', 'two-prs', '--accept')).toBe(2)
		expect(run).not.toHaveBeenCalled()
		expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
	})

	it('has skill accept refuse a partial latest result, naming why', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		await test(skill.folder, fakeRun({}), root, '--case', 'two-prs')
		stderr.mockClear()
		expect(await sub('accept', skill.folder, root)).toBe(1)
		expect(errors()).toMatch(/partial-result: .*ran only two-prs/)
		expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
	})
})

describe('skill test concurrency (R103)', () => {
	const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
	async function withThreads(threads: number, evals: string | undefined) {
		const skill = goodSkill()
		if (evals !== undefined) writeFileSync(join(skill.folder, 'evals', 'evals.yaml'), evals)
		const seen: { config?: Record<string, unknown> } = {}
		const root = repo()
		mkdirSync(join(root, '.git'))
		const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
			createSkillCommand({ runPromptfoo: fakeRun(seen), threads }),
		)
		await app.parse(['node', 'cyber-agentkit', 'skill', 'test', skill.folder, '--root', root, '--format', 'json'])
		return seen.config?.['evaluateOptions'] as { maxConcurrency: number }
	}
	const base = readFileSync(join(goodSkill().folder, 'evals', 'evals.yaml'), 'utf8')

	it('runs fewer than half the hardware threads at once, and at least one, and says so in the plan line', async () => {
		expect(await withThreads(16, undefined)).toMatchObject({ maxConcurrency: 7 })
		expect(errors()).toContain('; 7 at once\n')
		for (const [threads, bound] of [
			[2, 1],
			[3, 1],
			[4, 1],
			[5, 2],
			[1, 1],
		] as const)
			expect(await withThreads(threads, undefined)).toMatchObject({ maxConcurrency: bound })
	})

	it('lowers to the evals concurrency, and caps a larger one with a warning', async () => {
		expect(await withThreads(16, `concurrency: 2\n${base}`)).toMatchObject({ maxConcurrency: 2 })
		expect(errors()).toContain('; 2 at once\n')
		expect(errors()).not.toContain('warning')
		expect(await withThreads(16, `concurrency: 12\n${base}`)).toMatchObject({ maxConcurrency: 7 })
		expect(errors()).toMatch(/warning: .*asks for 12 runs at once; running 7/)
	})

	it('is an eval-set error when concurrency is not a positive whole number', async () => {
		const skill = goodSkill()
		writeFileSync(join(skill.folder, 'evals', 'evals.yaml'), `concurrency: 0\n${base}`)
		const run = vi.fn(fakeRun({}))
		expect(await test(skill.folder, run, repo())).toBe(1)
		expect(run).not.toHaveBeenCalled()
		expect(errors()).toMatch(/evals-invalid: .*`concurrency` is not a positive whole number/)
	})
})
