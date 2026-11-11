import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
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

		it('writes expected.json only with --accept, in the shape of latest.json', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			await test(skill.folder, fakeRun({}), root)
			expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
			await test(skill.folder, fakeRun({}), root, '--accept')
			const latest = readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8')
			expect(readFileSync(join(skill.folder, 'evals', 'expected.json'), 'utf8')).toBe(latest)
		})

		it('accepts the last saved result without running, and errors when there is none', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			const run = vi.fn(fakeRun({}))
			expect(await sub('accept', skill.folder, root, run)).toBe(1)
			expect(stderr.mock.calls.join('')).toContain('no-result')
			expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
			await test(skill.folder, fakeRun({}), root)
			expect(await sub('accept', skill.folder, root, run)).toBe(0)
			expect(run).not.toHaveBeenCalled()
			expect(readFileSync(join(skill.folder, 'evals', 'expected.json'), 'utf8')).toBe(
				readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'),
			)
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
			await test(skill.folder, fakeRun({}), root)
			await test(skill.folder, fakeRun({}, false), root)
			const second = JSON.parse(readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'))
			expect(second.comparedWith).toBe('previous')
		})
	})
})
