import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
