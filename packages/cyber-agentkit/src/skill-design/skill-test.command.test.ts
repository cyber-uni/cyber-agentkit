import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli } from 'clibuilder'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import type { PluginEvalRun } from './plugin-eval-backend.js'
import type { PluginList } from './plugin-load.js'
import { createSkillCommand } from './skill.command.js'
import { goodEvals, goodSkill, shippedSandbox } from './skill-design.fixtures.js'
import { acceptResult, keptAcceptedResults, type PromptfooRun } from './skill-test.js'
import type { TestResult } from './test-result.js'

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
/** Every plugin a run loads loads, and Claude Code has none installed: no test reaches the real `claude`. */
const loaded: PluginList = async (folders) => ({
	plugins: folders.map((installPath) => ({ installPath, enabled: true })),
})
/** This package as the plugin tier, as the CLI passes it, so its sandbox templates resolve (#302). */
const ownPlugin = { name: 'cyber-agentkit', root: fileURLToPath(new URL('../..', import.meta.url)) }
const offline = { listPlugins: loaded, installedPlugins: async () => [], plugin: ownPlugin }
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
		createSkillCommand({ ...offline, runPromptfoo: run }),
	)
	return app
		.parse<number | undefined>(['node', 'cyber-agentkit', 'skill', name, folder, '--root', root, '--format', 'json'])
		.then((code) => (typeof code === 'number' ? code : 0))
}

async function test(folder: string, run: PromptfooRun, root: string, ...extra: string[]) {
	return testWithOptions({ runPromptfoo: run }, folder, root, ...extra)
}

async function testWithOptions(
	options: Parameters<typeof createSkillCommand>[0],
	folder: string,
	root: string,
	...extra: string[]
) {
	const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
		createSkillCommand({ ...offline, ...options }),
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

	it('says in plain words why no run could log in, and saves no result (R108)', async () => {
		const skill = goodSkill()
		const root = repo()
		const reason =
			'login: Claude Code is logged in, but a test run is not: this Claude Code version no longer takes the login through CLAUDE_SECURESTORAGE_CONFIG_DIR'
		const run: PromptfooRun = async () => ({
			output: {
				results: {
					results: [0, 1].map((repeatIndex) => ({
						provider: { label: 'with-skill' },
						testCase: { description: 'two-prs' },
						repeatIndex,
						response: { error: reason, metadata: {} },
					})),
				},
			},
		})
		expect(await test(skill.folder, run, root)).toBe(1)
		const said = stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
		expect(said).toContain(`error: login: ${reason.slice('login: '.length)}`)
		expect(existsSync(join(fakeHome, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json'))).toBe(false)
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
		expect(readdirSync(folder).filter((name) => !name.endsWith('.replies.json'))).toHaveLength(2)
	})

	it('saves the reply of every run, passed or failed, beside the result, and names it (R138)', async () => {
		const root = repo()
		mkdirSync(join(root, '.git'))
		const pass = fakeRun({})
		const run: PromptfooRun = async (...args) => {
			const answer = (await pass(...args)) as { output: { results: { results: Record<string, unknown>[] } } }
			return { output: { evalId: 'eval-abc', ...answer.output } }
		}
		const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'text' }).command(
			createSkillCommand({ ...offline, runPromptfoo: run }),
		)
		const skill = goodSkill()
		await app.parse(['node', 'cyber-agentkit', 'skill', 'test', skill.folder, '--root', root])
		const folder = join(root, '.agents', 'skill-design', 'results', 'release-notes')
		const saved = JSON.parse(readFileSync(join(folder, 'latest.json'), 'utf8'))
		expect(saved.evalId).toBe('eval-abc')
		expect(saved.replies).toBe(`${saved.at.replace(/:/g, '-')}.replies.json`)
		const replies = JSON.parse(readFileSync(join(folder, saved.replies), 'utf8'))
		expect(replies.length).toBeGreaterThan(0)
		expect(replies).toContainEqual(
			expect.objectContaining({ case: 'two-prs', arm: 'with-skill', run: 1, outcome: 'pass', reply: 'x' }),
		)
		expect(replies).toContainEqual(expect.objectContaining({ case: 'two-prs', arm: 'baseline', run: 3 }))
		expect(printed()).toContain(`replies of every run: ${join(folder, saved.replies)}`)
		// the expected result stays as it was: no path or database ID of this machine goes into it
		await sub('accept', skill.folder, root)
		const accepted = JSON.parse(readFileSync(join(skill.folder, 'evals', 'expected.json'), 'utf8'))
		expect(accepted).not.toHaveProperty('replies')
		expect(accepted).not.toHaveProperty('evalId')
	})

	it('reports a guard case that passes without the skill too as expected, and one that fails as a fail (R160)', async () => {
		const evals = goodEvals.replace(
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs }',
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs, guard: true }',
		)
		const text = async (pass: boolean) => {
			stdout.mockClear()
			const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'text' }).command(
				createSkillCommand({ ...offline, runPromptfoo: fakeRun({}, pass) }),
			)
			const skill = goodSkill({ 'evals/evals.yaml': evals })
			await app.parse(['node', 'cyber-agentkit', 'skill', 'test', skill.folder, '--root', repo()])
			return printed()
		}
		const passing = await text(true)
		expect(passing).toContain(
			'guard two-prs: pass 3 of 3, baseline 3 of 3 — passes without the skill too, as a guard is expected to',
		)
		expect(passing).toMatch(/^C1 \(guard\): pass 3 of 3, baseline 3 of 3$/m)
		expect(await text(false)).toContain(
			'guard two-prs: fail 0 of 3, baseline 0 of 3 — a guard that fails with the skill is a failure',
		)
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

	describe('a plugin that declares dependencies (#231)', () => {
		/** The skill moved into a plugin `kit` that depends on `cyber-agentkit`; answers the skill's folder. */
		async function inKit(): Promise<string> {
			const skill = goodSkill()
			const pluginRoot = join(skill.folder, '..')
			mkdirSync(join(pluginRoot, '.claude-plugin'), { recursive: true })
			writeFileSync(
				join(pluginRoot, '.claude-plugin', 'plugin.json'),
				JSON.stringify({ name: 'kit', dependencies: ['cyber-agentkit'] }),
			)
			const { renameSync } = await import('node:fs')
			mkdirSync(join(pluginRoot, 'skills'), { recursive: true })
			renameSync(skill.folder, join(pluginRoot, 'skills', 'release-notes'))
			return join(pluginRoot, 'skills', 'release-notes')
		}
		function agentkit(): string {
			const root = mkdtempSync(join(tmpdir(), 'skill-test-agentkit-'))
			mkdirSync(join(root, '.claude-plugin'))
			writeFileSync(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'cyber-agentkit' }))
			return root
		}
		const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
		/** A fake promptfoo that keeps each arm's dependency folders and whether each held the dependency's manifest. */
		function watching(seen: { config?: Record<string, unknown>; loaded?: boolean[] }): PromptfooRun {
			return async (dir, config, output) => {
				const answer = await fakeRun(seen)(dir, config, output)
				const providers = seen.config?.['providers'] as { config: { dependencyDirs?: string[] } }[]
				seen.loaded = providers.flatMap((p) =>
					(p.config.dependencyDirs ?? []).map((path) => existsSync(join(path, '.claude-plugin', 'plugin.json'))),
				)
				return answer
			}
		}

		it('loads the installed dependency in both arms', async () => {
			const folder = await inKit()
			const seen: { config?: Record<string, unknown>; loaded?: boolean[] } = {}
			const installed = async () => [
				{ id: 'cyber-agentkit@cyber-uni', path: agentkit(), scope: 'user' as const, research: ['E-CC-P2'] },
			]
			expect(await testWithOptions({ runPromptfoo: watching(seen), installedPlugins: installed }, folder, repo())).toBe(
				0,
			)
			const providers = seen.config?.['providers'] as { config: { dependencyDirs?: string[] } }[]
			expect(providers.map((p) => p.config.dependencyDirs?.length)).toEqual([1, 1])
			expect(providers[0]?.config.dependencyDirs).toEqual(providers[1]?.config.dependencyDirs)
			expect(seen.loaded).toEqual([true, true])
		})

		it('loads a dependency from a folder passed with --plugin', async () => {
			const folder = await inKit()
			const seen: { config?: Record<string, unknown>; loaded?: boolean[] } = {}
			expect(await testWithOptions({ runPromptfoo: watching(seen) }, folder, repo(), '--plugin', agentkit())).toBe(0)
			expect(seen.loaded).toEqual([true, true])
		})

		it('stops with dependency-missing before any run when a dependency is not found', async () => {
			const run = vi.fn()
			expect(await testWithOptions({ runPromptfoo: run }, await inKit(), repo())).toBe(1)
			expect(run).not.toHaveBeenCalled()
			expect(errors()).toContain(
				'error: dependency-missing: kit depends on cyber-agentkit, which is not installed; install it (claude plugin install cyber-agentkit) or pass its folder with --plugin <folder>',
			)
			expect(printed()).toBe('')
		})

		it('stops with plugin-load before any run when a plugin does not load, so no case scores an empty run', async () => {
			const run = vi.fn()
			const listPlugins: PluginList = async (folders) => ({
				plugins: folders.map((installPath, index) => ({
					installPath,
					enabled: index !== 0,
					...(index === 0 ? { errors: ['Dependency "cyber-agentkit" is not installed'] } : {}),
				})),
			})
			const code = await testWithOptions(
				{ runPromptfoo: run, listPlugins },
				await inKit(),
				repo(),
				'--plugin',
				agentkit(),
			)
			expect(code).toBe(1)
			expect(run).not.toHaveBeenCalled()
			expect(errors()).toContain('error: plugin-load: kit does not load: Dependency "cyber-agentkit" is not installed')
		})
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
			const { folder, replies, ...latest } = JSON.parse(
				readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'),
			)
			expect(folder).toBeDefined()
			expect(replies).toBeDefined() // the replies stay on this machine, like the folder
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
			const {
				folder: _folder,
				replies: _replies,
				...latest
			} = JSON.parse(readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'))
			expect(latest).not.toHaveProperty('savedAsExpected')
			expect(JSON.parse(readFileSync(expected, 'utf8'))).toEqual(latest)

			const first = readFileSync(expected, 'utf8')
			await test(skill.folder, fakeRun({}), root) // a later pass does not replace it
			expect(readFileSync(expected, 'utf8')).toBe(first)
		})

		describe('a first result that is not every pass (#322)', () => {
			const unavailable = 'The model claude-sonnet-4-5@20250929 is not available on your vertex deployment'
			/** The fake promptfoo, with every run ending in an error before the model answers. */
			const erroring: PromptfooRun = async (folder, config, out) => {
				const ran = await fakeRun({})(folder, config, out)
				if (!('output' in ran)) return ran
				for (const item of (ran.output as { results: { results: Record<string, any>[] } }).results.results)
					if (String(item['testCase'].description).startsWith('trigger') && item['provider'].label === 'baseline')
						item['response'].metadata.skipped = true
					else item['response'].error = unavailable
				return ran
			}

			it('does not save a result where no run finished, says why, and fails', async () => {
				const skill = goodSkill()
				const root = gitRepo()
				expect(await test(skill.folder, erroring, root)).toBe(1)
				expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
				const report = JSON.parse(printed())
				expect(report).not.toHaveProperty('savedAsExpected')
				expect(report.notSavedAsExpected).toBe('no run finished')
				expect(report.notRun.length).toBeGreaterThan(0)
			})

			it('does not save a result whose criteria are not tested, and says why', async () => {
				const skill = goodSkill({ 'evals/evals.yaml': goodEvals.replace(/rubrics:[\s\S]*$/, '') })
				const root = gitRepo()
				expect(await test(skill.folder, fakeRun({}), root)).toBe(0)
				expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
				const report = JSON.parse(printed())
				expect(report.trigger.every((item: { status: string }) => item.status === 'pass')).toBe(true)
				expect(report).not.toHaveProperty('savedAsExpected')
				expect(report.notSavedAsExpected).toBe('not every trigger case and criterion passed: 2 not tested')
			})

			describe('a planned skip is no failure, a harness failure is (#327)', () => {
				const outside = '  - { id: post-it, prompt: post the notes, effects: outside }\n'
				const onlyOutside = `outcome:\n${outside}rubrics:\n  C1:\n    - contains: "## Release notes"\n  C2:\n    - not-regex: "x"\n`

				it('exits 0 when every case is a planned skip, saves nothing as expected, and says so', async () => {
					const skill = goodSkill({ 'evals/evals.yaml': onlyOutside })
					const root = gitRepo()
					expect(await test(skill.folder, fakeRun({}), root)).toBe(0)
					expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
					const report = JSON.parse(printed())
					expect(report).not.toHaveProperty('savedAsExpected')
					expect(report.notSavedAsExpected).toBe('every case was skipped before running')
					expect(report.notRun).toEqual([
						{ case: 'post-it', reason: 'it has an outside effect the run cannot contain', kind: 'skipped' },
					])
				})

				it('exits 0 when a planned skip sits beside passes, and does not save it as expected', async () => {
					const skill = goodSkill({ 'evals/evals.yaml': goodEvals.replace('rubrics:', `${outside}rubrics:`) })
					const root = gitRepo()
					expect(await test(skill.folder, fakeRun({}), root)).toBe(0)
					const report = JSON.parse(printed())
					expect(report.criteria.every((item: { status: string }) => item.status === 'pass')).toBe(true)
					expect(report.notRun).toEqual([expect.objectContaining({ case: 'post-it', kind: 'skipped' })])
				})

				it('exits 1 on one run that errored among passes, and names it a failure', async () => {
					const skill = goodSkill()
					const root = gitRepo()
					const oneErrors: PromptfooRun = async (folder, config, out) => {
						const ran = await fakeRun({})(folder, config, out)
						if (!('output' in ran)) return ran
						const rows = (ran.output as { results: { results: Record<string, any>[] } }).results.results
						const row = rows.find(
							(item) => item['testCase'].description === 'two-prs' && item['provider'].label === 'with-skill',
						) as Record<string, any>
						row['response'].error = unavailable
						return ran
					}
					expect(await test(skill.folder, oneErrors, root)).toBe(1)
					const report = JSON.parse(printed())
					expect(report.criteria.some((item: { status: string }) => item.status === 'fail')).toBe(false)
					expect(report.notRun).toEqual([{ case: 'two-prs (with-skill, run 1)', reason: unavailable, kind: 'failed' }])
				})

				it('reports which entries were skipped and which failed to run', async () => {
					const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'text' }).command(
						createSkillCommand({ ...offline, runPromptfoo: erroring }),
					)
					const skill = goodSkill({ 'evals/evals.yaml': goodEvals.replace('rubrics:', `${outside}rubrics:`) })
					await app.parse(['node', 'cyber-agentkit', 'skill', 'test', skill.folder, '--root', gitRepo()])
					const lines = printed().split('\n')
					expect(lines).toContain('skipped: post-it — it has an outside effect the run cannot contain')
					expect(lines).toContain(`failed to run: two-prs (with-skill, run 1) — ${unavailable}`)
				})
			})

			it('still saves a result where every trigger case and criterion passes', async () => {
				const skill = goodSkill()
				const root = gitRepo()
				expect(await test(skill.folder, fakeRun({}), root)).toBe(0)
				expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(true)
				const report = JSON.parse(printed())
				expect(report.savedAsExpected).toBe(true)
				expect(report).not.toHaveProperty('notSavedAsExpected')
			})
		})

		describe('with sandbox failures (R154)', () => {
			const bwrap =
				"bwrap: Can't create file at /tmp/skill-test-plugin-Xa1b2C/references/.claude/launch.json: Read-only file system"
			/** The fake promptfoo, with the first run of each case in each arm broken by the sandbox. */
			const breaking = (): PromptfooRun => async (folder, config, out) => {
				const ran = await fakeRun({})(folder, config, out)
				if (!('output' in ran)) return ran
				const rows = (ran.output as { results: { results: Record<string, any>[] } }).results.results
				for (const item of rows)
					if (item['repeatIndex'] === 0)
						item['response'].metadata.sandboxFault = { fault: 'bwrap-read-only-mount', text: bwrap }
				return ran
			}

			it('does not save a passing first result as expected, and says it held it', async () => {
				const skill = goodSkill()
				const root = gitRepo()
				expect(await test(skill.folder, breaking(), root)).toBe(0)
				expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
				const report = JSON.parse(printed())
				expect(report.expectedHeld).toBe(true)
				expect(report).not.toHaveProperty('savedAsExpected')
				expect(report.sandboxFailures.length).toBeGreaterThan(0)
			})

			it('holds it back from --accept too, and accepts it by skill accept, with a warning', async () => {
				const skill = goodSkill()
				const root = gitRepo()
				await test(skill.folder, breaking(), root, '--accept')
				expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
				expect(await sub('accept', skill.folder, root)).toBe(0)
				expect(stderr.mock.calls.join('')).toContain('warning: sandbox-failures:')
				const expected = JSON.parse(readFileSync(join(skill.folder, 'evals', 'expected.json'), 'utf8'))
				expect(expected.sandboxFailures.length).toBeGreaterThan(0)
			})

			it('warns at the top of the text report and lists the sandbox failures of each case', async () => {
				const root = gitRepo()
				const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'text' }).command(
					createSkillCommand({ ...offline, runPromptfoo: breaking() }),
				)
				await app.parse(['node', 'cyber-agentkit', 'skill', 'test', goodSkill().folder, '--root', root])
				const lines = printed().split('\n')
				expect(lines[1]).toMatch(/^warning: \d+ runs were sandbox failures/)
				expect(lines).toContain(`sandbox failure: two-prs — 1 with the skill, 1 without — ${bwrap}`)
				expect(printed()).toContain('not saved as evals/expected.json: it has sandbox failures')
			})
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
			const {
				folder: _folder,
				replies: _replies,
				...latest
			} = JSON.parse(readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'))
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

		it('keeps the expected result it replaces in evals/accepted, up to the limit, dropping the oldest', () => {
			const skill = goodSkill()
			const accepted = join(skill.folder, 'evals', 'accepted')
			const at = (n: number) => `2026-11-0${n}T00:00:00.000Z`
			const accept = (n: number) => acceptResult({ at: at(n), cases: [] } as unknown as TestResult, skill.folder)
			accept(1)
			expect(existsSync(accepted)).toBe(false) // the first accepted result is the expected one alone
			accept(1) // accepting the same run again keeps no copy of it
			expect(existsSync(accepted)).toBe(false)
			for (const n of [2, 3, 4, 5]) accept(n)
			expect(keptAcceptedResults).toBe(3)
			expect(readdirSync(accepted).sort()).toEqual([
				'2026-11-02T00-00-00.000Z.json',
				'2026-11-03T00-00-00.000Z.json',
				'2026-11-04T00-00-00.000Z.json',
			])
			expect(JSON.parse(readFileSync(join(skill.folder, 'evals', 'expected.json'), 'utf8')).at).toBe(at(5))
		})

		it('keeps an expected result saved before the history as the newest entry, and names the cases that moved', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			const expected = join(skill.folder, 'evals', 'expected.json')
			await test(skill.folder, fakeRun({}), root) // the first pass becomes expected.json
			// an expected result written before cases carried counts, in which trigger-1 fired once in 3 runs
			const old = JSON.parse(readFileSync(expected, 'utf8')) as TestResult
			old.at = '2026-01-01T00:00:00.000Z'
			old.cases = old.cases.map(({ case: id, status }) => ({ case: id, status }))
			old.trigger = old.trigger.map((item) => (item.case === 'trigger-1' ? { ...item, fired: 1 } : item))
			writeFileSync(expected, `${JSON.stringify(old, null, '\t')}\n`)

			await test(skill.folder, fakeRun({}), root, '--accept')
			const latest = JSON.parse(readFileSync(join(results(root), 'release-notes', 'latest.json'), 'utf8'))
			expect(latest.moved).toEqual([
				{
					case: 'trigger-1',
					rates: [
						{ at: old.at, passed: 1, ran: 3 },
						{ at: latest.at, passed: 3, ran: 3 },
					],
				},
			])
			expect(
				JSON.parse(readFileSync(join(skill.folder, 'evals', 'accepted', '2026-01-01T00-00-00.000Z.json'), 'utf8')),
			).toEqual(old)
			expect(JSON.parse(readFileSync(expected, 'utf8')).at).toBe(latest.at)

			// the text report names it too, its rate in each result, this run last
			const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'text' }).command(
				createSkillCommand({ runPromptfoo: fakeRun({}), plugin: ownPlugin }),
			)
			await app.parse(['node', 'cyber-agentkit', 'skill', 'test', skill.folder, '--root', root])
			expect(printed()).toContain('moved across accepted results: trigger-1 1 of 3 → 3 of 3 → now 3 of 3')
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
				expect.stringMatching(/\.replies\.json$/),
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
	// The progress watch polls on an interval and times its heartbeat by the clock, so these tests own both (#247):
	// time moves only when a fake run pauses, and a slow runner cannot stretch a gap past the heartbeat.
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
	})
	afterEach(() => {
		vi.useRealTimers()
	})
	const pause = (ms: number) => vi.advanceTimersByTimeAsync(ms)

	async function testWith(folder: string, run: PromptfooRun, root: string, ...extra: string[]) {
		const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
			createSkillCommand({ ...offline, runPromptfoo: run, progress: { heartbeatMs: 60, pollMs: 10 }, threads: 16 }),
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
				JSON.stringify({ at: '2026-01-01T00:00:00.000Z', cases: [], cost: 2, durationMs: 90_000 }),
			)
			await testWith(skill.folder, fakeRun({}), root)
			// an expected result saved before the run count was recorded: the count is unknown, never guessed
			expect(errors()[0]).toContain('; last time an unknown number of runs took about 2 min, $2.00\n')
			const saved = JSON.parse(
				readFileSync(join(root, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json'), 'utf8'),
			)
			expect(saved.durationMs).toBeGreaterThanOrEqual(0)
			expect(saved.totalRuns).toBeGreaterThan(0)
		})
	})

	describe('--estimate (#214)', () => {
		it('makes no run and prints the runs, the estimate, and whether it is within the budget', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			let ran = false
			const run: PromptfooRun = async (...args) => {
				ran = true
				return fakeRun({})(...args)
			}
			expect(await test(skill.folder, run, root, '--estimate')).toBe(0)
			expect(ran).toBe(false)
			expect(JSON.parse(printed())).toMatchObject({
				skill: 'release-notes',
				runs: 24,
				estimate: 4.32,
				basis: 'per-run-default',
				budget: { cost: 10, runs: 60, from: 'default' },
				within: true,
				line: 'Test budget: within (24 runs, $4.32; budget $10 or 60 runs; no budget configured, default used)',
			})
			expect(existsSync(join(root, '.agents', 'skill-design', 'results'))).toBe(false)
		})

		it('takes the budget from its options, and scales the last saved result', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			await test(skill.folder, fakeRun({}), root)
			const latest = join(root, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json')
			const saved = JSON.parse(readFileSync(latest, 'utf8'))
			writeFileSync(latest, JSON.stringify({ ...saved, cost: 3, totalRuns: 12, durationMs: 120_000 }))
			stdout.mockClear()
			await test(skill.folder, fakeRun({}), root, '--estimate', '--budget-cost', '5', '--budget-runs', '20')
			expect(JSON.parse(printed())).toMatchObject({
				runs: 24,
				estimate: 6,
				basis: 'last-result',
				last: { runs: 12, cost: 3, durationMs: 120_000 },
				budget: { cost: 5, runs: 20, from: 'flags' },
				within: false,
			})
		})

		it('takes the budget skill-design.autonomy sets when no option gives one, and prints the Test budget line (#238)', async () => {
			const skill = goodSkill()
			const root = gitRepo()
			mkdirSync(join(root, '.agents', 'references'), { recursive: true })
			writeFileSync(
				join(root, '.agents', 'references', 'skill-design.autonomy.md'),
				"---\ndescription: This repository's test budget.\n---\n\n## test budget\n\n$0.01 or 1 runs\n",
			)
			await test(skill.folder, fakeRun({}), root, '--estimate')
			expect(JSON.parse(printed())).toMatchObject({
				budget: { cost: 0.01, runs: 1, from: 'reference' },
				within: false,
				line: 'Test budget: over (24 runs, $4.32; budget $0.01 or 1 runs)',
			})
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
			// 200 ms with no run ended, and a heartbeat every 60 ms: one at 60, 120, and 180
			expect(lines).toEqual([
				'still running: 2 runs in progress, longest 1m5s\n',
				'still running: 2 runs in progress, longest 1m5s\n',
				'still running: 2 runs in progress, longest 1m5s\n',
				'[1/24] two-prs run 1 (with skill): pass, 1m06s\n',
			])
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
			createSkillCommand({ ...offline, runPromptfoo: fakeRun(seen), threads }),
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

describe('skill test --harness and --backend (#163)', () => {
	async function run(
		folder: string,
		root: string,
		options: { runPromptfoo?: PromptfooRun; runPluginEval?: PluginEvalRun },
		...extra: string[]
	) {
		const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
			createSkillCommand({ ...offline, ...options }),
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
	const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')

	it('drives Codex through its CLI with the isolation its harness definition declares, and warns what still reaches a run', async () => {
		const seen: { config?: Record<string, unknown> } = {}
		expect(
			await run(goodSkill().folder, repo(), { runPromptfoo: fakeRun(seen) }, '--harness', 'codex', '--model', 'm'),
		).toBe(0)
		const providers = seen.config?.['providers'] as { config: Record<string, any> }[]
		expect(providers[0]?.config).toMatchObject({
			harness: 'codex',
			isolation: { projectSkills: '.agents/skills', login: { store: 'config-dir' } },
			command: { executable: 'codex', args: expect.arrayContaining(['exec', '--model', 'm', '--ignore-user-config']) },
		})
		expect(errors()).toContain('warning: each codex run still reads the global AGENTS.md')
		expect(errors()).toContain('warning: skill test does not contain codex runs')
	})

	it('passes Claude Code its isolation by default, with no command', async () => {
		const seen: { config?: Record<string, unknown> } = {}
		await run(goodSkill().folder, repo(), { runPromptfoo: fakeRun(seen) })
		const providers = seen.config?.['providers'] as { config: Record<string, any> }[]
		expect(providers[0]?.config).toMatchObject({
			harness: 'claude-code',
			isolation: { projectSkills: '.claude/skills' },
		})
		expect(providers[0]?.config['command']).toBeUndefined()
		expect(errors()).not.toContain('does not contain')
	})

	it('is a usage error for a harness it cannot drive or does not know, and nothing runs', async () => {
		let ran = false
		const never: PromptfooRun = async () => {
			ran = true
			return { problem: 'x' }
		}
		expect(await run(goodSkill().folder, repo(), { runPromptfoo: never }, '--harness', 'gemini-cli')).toBe(2)
		expect(errors()).toContain('error: unsupported-harness: skill test cannot drive gemini-cli')
		expect(await run(goodSkill().folder, repo(), { runPromptfoo: never }, '--harness', 'nope')).toBe(2)
		expect(errors()).toContain('error: unknown-harness: no harness nope')
		expect(ran).toBe(false)
	})

	it('runs on claude plugin eval with --backend plugin-eval and saves the same result shape', async () => {
		const calls: string[][] = []
		const pluginEval: PluginEvalRun = async (args) => {
			calls.push(args)
			return { output: { schemaVersion: 1, cases: [] } }
		}
		const root = repo()
		// it ran no case, so the test fails (#322), but it still saves the result
		expect(await run(goodSkill().folder, root, { runPluginEval: pluginEval }, '--backend', 'plugin-eval')).toBe(1)
		expect(calls.length).toBe(2)
		const saved = JSON.parse(printed())
		expect(saved).toMatchObject({ version: 1, skill: 'release-notes', baseline: 'without the skill' })
		expect(saved.cases.map((c: { status: string }) => c.status)).toContain('not-run')
		expect(errors()).toContain('warning: claude plugin eval runs each case itself, so skill test does not contain it')
	})

	it('refuses the plugin-eval backend with another harness, and an unknown backend', async () => {
		expect(await run(goodSkill().folder, repo(), {}, '--backend', 'plugin-eval', '--harness', 'codex')).toBe(2)
		expect(errors()).toContain('error: unsupported-harness: the plugin-eval backend drives claude-code only, not codex')
		expect(await run(goodSkill().folder, repo(), {}, '--backend', 'inspect')).toBe(2)
		expect(errors()).toContain('error: unknown-backend: no backend inspect')
	})
})

describe('skill test scripts from outside the repository (R158)', () => {
	const scripted = () =>
		goodSkill({
			'evals/evals.yaml': `${goodEvals.replace(
				'  - { id: two-prs, prompt: write the notes, files: files/two-prs }',
				'  - { id: two-prs, prompt: write the notes, files: files/two-prs, setup: setup/two-prs.sh }\n  - { id: plain, prompt: write the notes again, files: files/two-prs }',
			)}`.replace(
				'    - not-regex: "Merge (pull request|branch)"',
				'    - not-regex: "Merge (pull request|branch)"\n    - script: test -f NOTES.md',
			),
			'evals/setup/two-prs.sh': 'git checkout -q -b release\n',
		})
	const said = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')

	it('lists the scripts of a skill outside the repository and runs no case that needs one', async () => {
		const skill = scripted()
		const seen: { config?: Record<string, unknown> } = {}
		await test(skill.folder, fakeRun(seen), repo())
		expect(said()).toContain('warning: untrusted-scripts:')
		expect(said()).toContain(`case two-prs: setup script ${join(skill.folder, 'evals', 'setup', 'two-prs.sh')}`)
		expect(said()).toContain('case two-prs: script check `test -f NOTES.md`')
		expect(said()).toContain('case plain: script check `test -f NOTES.md`')
		const tests = seen.config?.['tests'] as { description: string }[]
		expect(tests.map((item) => item.description)).not.toContain('two-prs')
		expect(tests.map((item) => item.description)).not.toContain('plain')
		const report = JSON.parse(printed())
		expect(report.notRun).toContainEqual({
			case: 'two-prs',
			reason: 'it runs a script from outside this repository; read it, then pass --trust-scripts',
			kind: 'skipped',
		})
	})

	it('runs them with --trust-scripts, and still lists them', async () => {
		const skill = scripted()
		const seen: { config?: Record<string, unknown> } = {}
		await test(skill.folder, fakeRun(seen), repo(), '--trust-scripts')
		expect(said()).toContain('running its scripts, as --trust-scripts asks')
		const tests = seen.config?.['tests'] as { description: string; vars: Record<string, string> }[]
		expect(tests.find((item) => item.description === 'two-prs')?.vars['setup']).toBe(
			join(skill.folder, 'evals', 'setup', 'two-prs.sh'),
		)
	})

	it('runs the scripts of a skill inside the repository without asking', async () => {
		const skill = scripted()
		const seen: { config?: Record<string, unknown> } = {}
		await test(skill.folder, fakeRun(seen), join(skill.folder, '..', '..'))
		expect(said()).not.toContain('untrusted-scripts')
		const tests = seen.config?.['tests'] as { description: string }[]
		expect(tests.map((item) => item.description)).toContain('two-prs')
	})
})

describe('skill test model (R161)', () => {
	const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
	const latest = () =>
		JSON.parse(
			readFileSync(join(fakeHome, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json'), 'utf8'),
		) as TestResult
	type Seen = { config?: Record<string, unknown> }
	const providers = (seen: Seen) => seen.config?.['providers'] as { config: Record<string, any> }[]
	const tests = (seen: Seen) => seen.config?.['tests'] as { description: string; vars: Record<string, string> }[]
	const ownModels = goodEvals
		.replace(
			'{ prompt: write release notes, expect: fire }',
			'{ prompt: write release notes, expect: fire, model: small }',
		)
		.replace(
			'{ id: two-prs, prompt: write the notes, files: files/two-prs }',
			'{ id: two-prs, prompt: write the notes, files: files/two-prs, model: claude-opus-5-5 }',
		)

	it("runs each case on the harness's mid-tier model when no model is named, and records it", async () => {
		const seen: Seen = {}
		expect(await test(goodSkill().folder, fakeRun(seen), repo())).toBe(0)
		expect(providers(seen).map((p) => p.config.inner.model)).toEqual(['sonnet', 'sonnet'])
		expect(tests(seen).every((item) => item.vars['model'] === undefined)).toBe(true)
		expect(latest().model).toBe('sonnet')
		expect(latest().cases.every((item) => item.model === undefined)).toBe(true)
	})

	it('takes a tier or a model ID named with --model for the whole run', async () => {
		const tier: Seen = {}
		await test(goodSkill().folder, fakeRun(tier), repo(), '--model', 'top')
		expect(providers(tier)[0]?.config.inner.model).toBe('opus')
		const id: Seen = {}
		await test(goodSkill().folder, fakeRun(id), repo(), '--model', 'claude-haiku-5-5')
		expect(providers(id)[0]?.config.inner.model).toBe('claude-haiku-5-5')
		expect(latest().model).toBe('claude-haiku-5-5')
	})

	it('runs a case that names its own model or tier on it, over --model, and the result names it', async () => {
		const seen: Seen = {}
		await test(goodSkill({ 'evals/evals.yaml': ownModels }).folder, fakeRun(seen), repo(), '--model', 'mid')
		const vars = Object.fromEntries(tests(seen).map((item) => [item.description, item.vars['model']]))
		expect(vars).toMatchObject({ 'trigger-1': 'haiku', 'trigger-2': undefined, 'two-prs': 'claude-opus-5-5' })
		expect(providers(seen)[0]?.config.inner.model).toBe('sonnet')
		const cases = Object.fromEntries(latest().cases.map((item) => [item.case, item.model]))
		expect(cases).toMatchObject({ 'trigger-1': 'haiku', 'trigger-2': undefined, 'two-prs': 'claude-opus-5-5' })
	})

	it('leaves the judge on --judge', async () => {
		const evals = goodEvals.replace('    - contains: "## Release notes"', '    - judge: Pass when it has notes.')
		const seen: Seen = {}
		await test(goodSkill({ 'evals/evals.yaml': evals }).folder, fakeRun(seen), repo(), '--judge', 'opus')
		const judged = tests(seen)
			.flatMap((item) => (item as unknown as { assert: { type: string; provider?: any }[] }).assert)
			.find((check) => check.type === 'llm-rubric')
		expect(judged?.provider.config.model).toBe('opus')
		expect(providers(seen)[0]?.config.inner.model).toBe('sonnet')
	})

	it('runs Codex on its own default when no model is named, since its tiers are not known, and says so', async () => {
		const seen: Seen = {}
		expect(await test(goodSkill().folder, fakeRun(seen), repo(), '--harness', 'codex')).toBe(0)
		expect(providers(seen)[0]?.config.command.args).not.toContain('--model')
		expect(providers(seen)[0]?.config.command.modelFlag).toBe('--model')
		expect(errors()).toContain('warning: harness-default-model: codex has no known mid-tier model')
		expect(latest().model).toBe('default')
	})

	it('refuses a tier the harness does not map, for the run or a case, before any run', async () => {
		const seen: Seen = {}
		expect(await test(goodSkill().folder, fakeRun(seen), repo(), '--harness', 'codex', '--model', 'top')).not.toBe(0)
		expect(errors()).toContain('error: unknown-tier: codex has no known top-tier model')
		stderr.mockClear()
		const skill = goodSkill({ 'evals/evals.yaml': ownModels })
		expect(await test(skill.folder, fakeRun(seen), repo(), '--harness', 'codex', '--model', 'gpt-x')).not.toBe(0)
		expect(errors()).toContain('error: unknown-tier: case trigger-1: codex has no known small-tier model')
		expect(seen.config).toBeUndefined()
	})

	it('prints the model, each case on its own, and warns when the compared result ran on another model', async () => {
		const text = async (...extra: string[]) => {
			stdout.mockClear()
			const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'text' }).command(
				createSkillCommand({ ...offline, runPromptfoo: fakeRun({}) }),
			)
			await app.parse(['node', 'cyber-agentkit', 'skill', 'test', skill.folder, '--root', root, ...extra])
			return printed()
		}
		const skill = goodSkill({ 'evals/evals.yaml': ownModels })
		const root = repo()
		const first = await text()
		expect(first).toMatch(/^release-notes: 3 runs per case, threshold 2, baseline without the skill, model sonnet$/m)
		expect(first).toContain('model trigger-1: haiku\nmodel two-prs: claude-opus-5-5\n')
		expect(first).not.toContain('model changed')
		const second = await text('--model', 'top')
		expect(second).toContain(
			'warning: model changed since expected: sonnet → opus for trigger-2, trigger-3, trigger-4, trigger-5, trigger-6',
		)
		const third = await text('--model', 'top')
		expect(third).toContain('warning: model changed since expected: sonnet → opus')
		acceptLatest(skill.folder)
		expect(await text('--model', 'top')).not.toContain('model changed')
	})
})

/** Accepts the last saved result of the release-notes skill as its expected result. */
function acceptLatest(skillFolder: string): void {
	const saved = JSON.parse(
		readFileSync(join(fakeHome, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json'), 'utf8'),
	) as TestResult
	acceptResult(saved, skillFolder)
}

describe('skill test and the usage limit (R162, R163)', () => {
	const limitText = "You've hit your 5-hour limit · resets 4:40am (America/Los_Angeles)"
	const gitRepo = () => {
		const root = repo()
		mkdirSync(join(root, '.git'))
		return root
	}
	const latestOf = (root: string): TestResult =>
		JSON.parse(readFileSync(join(root, '.agents', 'skill-design', 'results', 'release-notes', 'latest.json'), 'utf8'))
	/** The fake promptfoo, with every third run in each arm ended by the usage limit, the first of them started. */
	const limited =
		(seen: { config?: Record<string, unknown> } = {}): PromptfooRun =>
		async (folder, config, out) => {
			const ran = await fakeRun(seen)(folder, config, out)
			if (!('output' in ran)) return ran
			let first = true
			// a trigger case runs with the skill only: the provider skips its baseline before anything else
			for (const item of (ran.output as { results: { results: Record<string, any>[] } }).results.results)
				if (String(item['testCase'].description).startsWith('trigger') && item['provider'].label === 'baseline')
					item['response'].metadata.skipped = true
				else if (item['repeatIndex'] === 2) {
					item['response'].error = first
						? `Claude Code returned an error result: ${limitText}`
						: `limit reached: ${limitText}`
					item['response'].metadata.limitReached = {
						text: limitText,
						resets: '4:40am (America/Los_Angeles)',
						started: first,
					}
					first = false
				}
			return ran
		}
	/** The fake promptfoo for a resume: one row per test and arm it names, each passing, with the run it stands for. */
	const resuming =
		(seen: { config?: Record<string, unknown> }): PromptfooRun =>
		async (folder, config) => {
			const parsed: Record<string, unknown> = parse(readFileSync(join(folder, config), 'utf8'))
			seen.config = parsed
			const tests = parsed['tests'] as { description: string; vars: Record<string, string> }[]
			const results = tests.flatMap((test) =>
				(JSON.parse(test.vars['__arms'] ?? '[]') as string[]).map((arm) => {
					const ids = Object.keys(JSON.parse(test.vars['rubrics'] ?? '{}'))
					return {
						provider: { label: arm === 'skill' ? 'with-skill' : 'baseline' },
						testCase: { description: test.description, vars: test.vars },
						repeatIndex: 0,
						response: {
							output: 'x',
							metadata: { fired: true, checks: Object.fromEntries(ids.map((id) => [id, { pass: true }])) },
						},
						gradingResult: { componentResults: ids.map((metric) => ({ pass: true, assertion: { metric } })) },
					}
				}),
			)
			return { output: { results: { results } } }
		}

	it('passes the provider the usage-limit messages and a file to stop the runs after one', async () => {
		const seen: { config?: Record<string, unknown> } = {}
		await test(goodSkill().folder, fakeRun(seen), gitRepo())
		const providers = (seen.config?.['providers'] ?? []) as { config: Record<string, unknown> }[]
		const config = providers[0]?.config
		expect(config?.['usageLimits']).toEqual([expect.objectContaining({ id: 'claude-code-usage-limit' })])
		expect(String(config?.['limitFile'])).toMatch(/usage-limit\.json$/)
	})

	it('saves an incomplete result with the runs left, never as expected, and exits 1', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		expect(await test(skill.folder, limited(), root, '--accept')).toBe(1)
		expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
		const latest = latestOf(root)
		expect(latest.incomplete).toMatchObject({
			reason: 'limit reached',
			text: limitText,
			resets: '4:40am (America/Los_Angeles)',
			options: { harness: 'claude-code', backend: 'promptfoo' },
		})
		// 6 trigger cases with the skill, 1 outcome case in both arms: one run each left
		expect(latest.incomplete?.left).toHaveLength(8)
		expect(latest.incomplete?.runs).toMatch(/\.runs\.json$/)
		expect(latest).not.toHaveProperty('savedAsExpected')
		expect(await sub('accept', skill.folder, root)).toBe(1)
		expect(stderr.mock.calls.join('')).toContain('error: incomplete-result:')
		expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(false)
	})

	it('says at the top of the text report that the limit was reached, when it resets, and which runs are left', async () => {
		const root = gitRepo()
		const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'text' }).command(
			createSkillCommand({ ...offline, runPromptfoo: limited() }),
		)
		await app.parse(['node', 'cyber-agentkit', 'skill', 'test', goodSkill().folder, '--root', root])
		const lines = printed().split('\n')
		expect(lines[1]).toMatch(
			/^warning: incomplete: the usage limit was reached \(You've hit your 5-hour limit .*\); 8 runs are left and count toward no pass rate: .*two-prs \(with skill, run 3\), two-prs \(without skill, run 3\)/,
		)
		expect(printed()).toContain('incomplete: not saved as the expected result; run `skill test --resume`')
	})

	it('resumes only the runs left, with the options the run had, and merges them into one complete result', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		await test(skill.folder, limited(), root)
		const stopped = latestOf(root)
		const seen: { config?: Record<string, unknown> } = {}
		expect(await test(skill.folder, resuming(seen), root, '--resume')).toBe(0)
		const tests = seen.config?.['tests'] as { description: string; vars: Record<string, string> }[]
		expect(tests.map((item) => [item.description, item.vars['__run'], item.vars['__arms']])).toContainEqual([
			'two-prs',
			'3',
			'["skill","baseline"]',
		])
		expect(tests).toHaveLength(7)
		expect(seen.config?.['evaluateOptions']).toMatchObject({ repeat: 1 })
		const merged = latestOf(root)
		expect(merged).not.toHaveProperty('incomplete')
		expect(merged.resumedFrom).toBe(stopped.at)
		expect(merged.cases.find((item) => item.case === 'two-prs')).toMatchObject({ status: 'pass', passed: 3, ran: 3 })
		expect(merged.criteria.every((item) => item.status !== 'fail')).toBe(true)
		// the first full pass is saved as expected, as an unbroken run would be
		expect(existsSync(join(skill.folder, 'evals', 'expected.json'))).toBe(true)
		const replies = JSON.parse(
			readFileSync(join(root, '.agents', 'skill-design', 'results', 'release-notes', merged.replies as string), 'utf8'),
		) as { case: string; arm: string; run: number; outcome: string }[]
		expect(
			replies
				.filter((item) => item.case === 'two-prs' && item.arm === 'with-skill')
				.map((item) => item.run)
				.sort(),
		).toEqual([1, 2, 3])
		expect(replies.some((item) => item.outcome === 'limit reached')).toBe(false)
		// the runs file is kept only while a resume can need it
		expect(
			readdirSync(join(root, '.agents', 'skill-design', 'results', 'release-notes')).some((name) =>
				name.endsWith('.runs.json'),
			),
		).toBe(false)
	})

	it('refuses a resume when the last result is complete, and runs nothing', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		await test(skill.folder, fakeRun({}), root)
		const run = vi.fn(fakeRun({}))
		expect(await test(skill.folder, run, root, '--resume')).toBe(1)
		expect(stderr.mock.calls.join('')).toContain('error: nothing-to-resume:')
		expect(run).not.toHaveBeenCalled()
	})

	it('refuses a resume when the skill changed since, and runs nothing', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		await test(skill.folder, limited(), root)
		appendFileSync(join(skill.folder, 'SKILL.md'), '\nA new line.\n')
		const run = vi.fn(fakeRun({}))
		expect(await test(skill.folder, run, root, '--resume')).toBe(1)
		expect(stderr.mock.calls.join('')).toContain('error: resume-changed:')
		expect(run).not.toHaveBeenCalled()
	})

	it('refuses options a resume takes from the result it resumes', async () => {
		const skill = goodSkill()
		const root = gitRepo()
		await test(skill.folder, limited(), root)
		expect(await test(skill.folder, fakeRun({}), root, '--resume', '--model', 'x')).toBe(2)
		expect(stderr.mock.calls.join('')).toContain('error: resume-options:')
	})
})

describe('skill case try (#290)', () => {
	const setupSkill = () =>
		goodSkill({
			'evals/evals.yaml':
				'outcome:\n  - { id: two-prs, prompt: write the notes, files: files/two-prs, setup: setup/two-prs.sh }\n  - { id: plain, prompt: x, files: files/two-prs }\n',
			'evals/setup/two-prs.sh': '#!/bin/sh\necho hi\n',
		})
	/** A fake promptfoo that answers the setup-only run as the provider does, and keeps the config it was given. */
	const tryRun =
		(seen: { config?: Record<string, any> }, tried: Record<string, unknown>, error?: string): PromptfooRun =>
		async (folder, config) => {
			seen.config = parse(readFileSync(join(folder, config), 'utf8'))
			return { output: { results: { results: [{ response: { ...(error ? { error } : {}), metadata: { tried } } }] } } }
		}
	const tryIt = (run: PromptfooRun, folder: string, kase: string, ...extra: string[]) =>
		cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' })
			.command(createSkillCommand({ ...offline, runPromptfoo: run }))
			.parse<number | undefined>(['node', 'cyber-agentkit', 'skill', 'case', 'try', folder, kase, ...extra])
			.then((code) => (typeof code === 'number' ? code : 0))

	it('runs only the setup, with one arm, no assertion, and a keep folder under the results path', async () => {
		const skill = setupSkill()
		const seen: { config?: Record<string, any> } = {}
		const code = await tryIt(
			tryRun(seen, { status: '?? a.txt\n', said: 'hi', failed: false }),
			skill.folder,
			'two-prs',
			'--root',
			join(skill.folder, '..'),
			'--format',
			'json',
		)
		expect(code).toBe(0)
		expect(seen.config?.['providers']).toHaveLength(1)
		const keep = seen.config?.['providers'][0].config.keep as string
		expect(keep).toBe(join(fakeHome, '.agents', 'skill-design', 'results', 'release-notes', 'try', 'two-prs'))
		expect(seen.config?.['tests']).toEqual([expect.objectContaining({ assert: [] })])
		expect(seen.config?.['tests'][0].vars.setup).toBe(join(skill.folder, 'evals', 'setup', 'two-prs.sh'))
		expect(existsSync(join(fakeHome, '.agents', 'skill-design', 'results', '.gitignore'))).toBe(true)
		expect(JSON.parse(printed())).toMatchObject({
			case: 'two-prs',
			status: '?? a.txt\n',
			folder: join(keep, 'folder'),
			home: join(keep, 'home'),
		})
	})

	it('prints the git status and what the setup printed as text, and exits 1 when the setup fails', async () => {
		const skill = setupSkill()
		const code = await tryIt(
			tryRun(
				{},
				{ status: '', said: 'cannot create .git/hooks/commit-msg: Read-only file system', failed: true },
				'setup script failed: x',
			),
			skill.folder,
			'two-prs',
			'--root',
			join(skill.folder, '..'),
			'--format',
			'text',
		)
		expect(code).toBe(1)
		expect(printed()).toContain('setup failed for case two-prs')
		expect(printed()).toContain('git status --porcelain:\n(clean)')
		expect(printed()).toContain('Read-only file system')
	})

	it('refuses a case with no setup script as a usage error, and runs nothing', async () => {
		const run = vi.fn()
		const skill = setupSkill()
		expect(await tryIt(run, skill.folder, 'plain', '--root', join(skill.folder, '..'))).toBe(2)
		expect(stderr.mock.calls.join('')).toContain('error: no-setup:')
		expect(run).not.toHaveBeenCalled()
	})

	it('refuses the setup of a skill outside the repository without --trust-scripts', async () => {
		const run = vi.fn()
		expect(await tryIt(run, setupSkill().folder, 'two-prs', '--root', repo())).toBe(1)
		expect(stderr.mock.calls.join('')).toContain('error: untrusted-scripts:')
		expect(run).not.toHaveBeenCalled()
	})
})

describe('skill test sandbox (#302)', () => {
	const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
	const providers = (seen: { config?: Record<string, unknown> }) =>
		seen.config?.['providers'] as { config: Record<string, unknown> }[]
	const choose = (folder: string, text: string) => {
		mkdirSync(join(folder, '.agents', 'references'), { recursive: true })
		writeFileSync(join(folder, '.agents', 'references', 'skill-design.test.sandbox.yaml'), text)
	}
	const folderOnly = 'extends: skill-design.test.sandbox.folder-only\n'
	const box = (seen: { config?: Record<string, unknown> }) =>
		providers(seen).map((p) => p.config['sandbox'] as { shell: { sandbox: boolean }; scripts: { sandbox: boolean } })

	it('runs in the default sandbox and records none of it when nothing chooses one', async () => {
		const seen: { config?: Record<string, unknown> } = {}
		expect(await test(goodSkill().folder, fakeRun(seen), repo())).toBe(0)
		expect(box(seen)).toEqual([shippedSandbox('claude-code'), shippedSandbox('claude-code')])
		expect(JSON.parse(printed()).sandbox).toBeUndefined()
		expect(errors()).not.toContain('no-sandbox')
	})

	it('runs folder-only with --sandbox folder-only, says so, and records sandbox none', async () => {
		const seen: { config?: Record<string, unknown> } = {}
		expect(await test(goodSkill().folder, fakeRun(seen), repo(), '--sandbox', 'folder-only')).toBe(0)
		expect(box(seen)).toEqual([shippedSandbox('folder-only'), shippedSandbox('folder-only')])
		expect(JSON.parse(printed()).sandbox).toBe('none')
		expect(errors()).toContain(
			'warning: no-sandbox: the folder-only template (--sandbox) runs shell commands, setup scripts, and script checks without a sandbox, with the network open',
		)
	})

	it('takes the template the repo tier chooses, and --sandbox over it', async () => {
		const root = repo()
		choose(root, `${folderOnly}scripts:\n  sandbox: true\n  network: closed\n`)
		const seen: { config?: Record<string, unknown> } = {}
		expect(await test(goodSkill().folder, fakeRun(seen), root)).toBe(0)
		expect(box(seen)[0]).toMatchObject({ shell: { sandbox: false }, scripts: { sandbox: true } })
		expect(JSON.parse(printed()).sandbox).toBe('scripts-only')
		expect(errors()).toContain('skill-design.test.sandbox in the repo tier')
		const again: { config?: Record<string, unknown> } = {}
		expect(await test(goodSkill().folder, fakeRun(again), root, '--sandbox', 'default')).toBe(0)
		expect(box(again)[0]).toEqual(shippedSandbox('claude-code'))
	})

	it("never takes the template from the skill's own folder", async () => {
		const skill = goodSkill({ 'references/skill-design.test.sandbox.default.yaml': folderOnly })
		choose(skill.folder, folderOnly)
		const seen: { config?: Record<string, unknown> } = {}
		expect(await test(skill.folder, fakeRun(seen), repo())).toBe(0)
		expect(box(seen)[0]).toEqual(shippedSandbox('claude-code'))
	})

	it('refuses an unknown template, and a tier document it cannot read, before any run', async () => {
		let ran = false
		const never: PromptfooRun = async () => {
			ran = true
			return { problem: 'x' }
		}
		expect(await test(goodSkill().folder, never, repo(), '--sandbox', 'none')).toBe(2)
		expect(errors()).toContain(
			'error: unknown-sandbox: no sandbox template none: no tier holds skill-design.test.sandbox.none',
		)
		const root = repo()
		choose(root, `${folderOnly}shell:\n  sandbox: off\n`)
		expect(await test(goodSkill().folder, never, root)).toBe(1)
		expect(errors()).toContain('error: sandbox-invalid:')
		expect(ran).toBe(false)
	})

	it('lists each path a folder-only run changed outside its folders, in the result and the text', async () => {
		const run: PromptfooRun = async (folder, config, output) => {
			const base = await fakeRun({})(folder, config, output)
			if ('problem' in base) return base
			const rows = (base.output as { results: { results: { response: { metadata: Record<string, unknown> } }[] } })
				.results.results
			if (rows[0]) rows[0].response.metadata['wroteOutside'] = ['/home/someone/.bashrc']
			return base
		}
		expect(await test(goodSkill().folder, run, repo(), '--sandbox', 'folder-only')).toBe(0)
		expect(JSON.parse(printed()).wroteOutside).toEqual([
			expect.objectContaining({ arm: 'skill', run: 1, target: '/home/someone/.bashrc' }),
		])
	})

	it('runs in the shipped claude-code template for a library caller that passes no plugin', async () => {
		const seen: { config?: Record<string, unknown> } = {}
		const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
			createSkillCommand({ listPlugins: loaded, installedPlugins: async () => [], runPromptfoo: fakeRun(seen) }),
		)
		const code = await app.parse([
			'node',
			'cyber-agentkit',
			'skill',
			'test',
			goodSkill().folder,
			'--root',
			repo(),
			'--format',
			'json',
		])
		expect(typeof code === 'number' ? code : 0).toBe(0)
		expect(box(seen)).toEqual([shippedSandbox('claude-code'), shippedSandbox('claude-code')])
		expect(errors()).not.toContain('sandbox-missing')
	})

	it('runs skill case try in the template chosen, as a test would', async () => {
		const skill = goodSkill({
			'evals/evals.yaml': 'outcome:\n  - { id: two-prs, prompt: write the notes, setup: setup/two-prs.sh }\n',
			'evals/setup/two-prs.sh': '#!/bin/sh\necho hi\n',
		})
		let seen: Record<string, any> = {}
		const run: PromptfooRun = async (folder, config) => {
			seen = parse(readFileSync(join(folder, config), 'utf8'))
			const tried = { status: '', said: 'hi', failed: false }
			return { output: { results: { results: [{ response: { metadata: { tried } } }] } } }
		}
		const code = await cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' })
			.command(createSkillCommand({ ...offline, runPromptfoo: run }))
			.parse<number | undefined>([
				'node',
				'cyber-agentkit',
				'skill',
				'case',
				'try',
				skill.folder,
				'two-prs',
				'--root',
				join(skill.folder, '..'),
				'--sandbox',
				'folder-only',
				'--format',
				'json',
			])
		expect(typeof code === 'number' ? code : 0).toBe(0)
		expect(seen['providers'][0].config.sandbox).toEqual(shippedSandbox('folder-only'))
	})
})
