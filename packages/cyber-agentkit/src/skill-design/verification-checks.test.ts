import { describe, expect, it } from 'vitest'
import {
	byId,
	goodEvals,
	goodSkill,
	goodSkillMd,
	makeSkill,
	namedEvals,
	routerSkillFiles,
} from './skill-design.fixtures.js'
import { checkVerification, evalsProblems, gitWriteLines } from './verification-checks.js'

describe('checkVerification', () => {
	it('passes a complete evals file', () => {
		expect(checkVerification(goodSkill({ 'evals/evals.yaml': namedEvals })).map((outcome) => outcome.status)).toEqual([
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
		])
	})

	it('flags a Done-when criterion no outcome case lists, and counts a case with no criteria as listing all (VER-13)', () => {
		const run = (evals: string) =>
			byId(checkVerification(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals })))['VER-13']
		expect(run(goodEvals)).toEqual({ id: 'VER-13', status: 'pass' })
		const some = goodEvals.replace(
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs }',
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs, criteria: [C1] }',
		)
		expect(some).not.toBe(goodEvals)
		expect(run(some)).toMatchObject({ status: 'fail', message: expect.stringContaining('lists C2') })
		const both = some.replace('criteria: [C1]', 'criteria: [C1, C2]')
		expect(run(both)).toEqual({ id: 'VER-13', status: 'pass' })
	})

	it('asks a name-only skill for three `skip` trigger cases and no `fire` ones (VER-2)', () => {
		const nameOnly = goodSkillMd.replace(/^description: .*$/m, 'description: By name only')
		const skipsOnly = goodEvals.replace(/^ {2}- \{ prompt: .*, expect: fire \}\n/gm, '')
		const passing = checkVerification(goodSkill({ 'SKILL.md': nameOnly, 'evals/evals.yaml': skipsOnly }))
		expect(passing[1]).toEqual({ id: 'VER-2', status: 'pass' })
		const twoSkips = skipsOnly.replace(/^ {2}- \{ prompt: review my diff, expect: skip \}\n/m, '')
		const failing = checkVerification(goodSkill({ 'SKILL.md': nameOnly, 'evals/evals.yaml': twoSkips }))
		expect(failing[1]).toMatchObject({
			id: 'VER-2',
			status: 'fail',
			message: '2 `skip` trigger cases for a name-only skill',
		})
		const matched = checkVerification(goodSkill({ 'evals/evals.yaml': skipsOnly }))
		expect(matched[1]).toMatchObject({ id: 'VER-2', status: 'fail', message: '0 `fire` and 3 `skip` trigger cases' })
	})

	it('fails VER-1 and leaves the rest not checked when the file is missing or not YAML', () => {
		const missing = checkVerification(makeSkill({ 'SKILL.md': goodSkillMd }))
		expect(missing[0]).toMatchObject({ id: 'VER-1', status: 'fail' })
		expect(missing.slice(1).every((outcome) => outcome.status === 'not-checked')).toBe(true)
		const bad = checkVerification(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': 'trigger: [' }))
		expect(bad[0]).toMatchObject({ id: 'VER-1', status: 'fail', message: expect.stringContaining('not valid YAML') })
	})

	it('accepts a positive timeout and rejects others (F8)', () => {
		expect(evalsProblems({ timeout: 30.5 })).toEqual([])
		for (const timeout of [0, -1, '60', null])
			expect(evalsProblems({ timeout })).toEqual(['`timeout` is not a positive number of seconds'])
	})

	it('accepts a list of host names as a case network, and rejects others (R107)', () => {
		const one = (network: unknown) => evalsProblems({ outcome: [{ id: 'a', prompt: 'p', network }] })
		expect(one(['registry.npmjs.org', '*.github.com'])).toEqual([])
		for (const network of ['example.com', [1], ['https://example.com'], ['a b']])
			expect(one(network)).toEqual(['outcome case 1: `network` is not a list of host names'])
	})

	it('accepts true or false as a case guard, and rejects others (R160)', () => {
		const one = (guard: unknown) => evalsProblems({ outcome: [{ id: 'a', prompt: 'p', guard }] })
		expect(one(true)).toEqual([])
		expect(one(false)).toEqual([])
		for (const guard of ['yes', 1, []]) expect(one(guard)).toEqual(['outcome case 1: `guard` is not true or false'])
	})

	it("accepts a tier or a model ID as a case's model, and rejects others (R161)", () => {
		const outcome = (model: unknown) => evalsProblems({ outcome: [{ id: 'a', prompt: 'p', model }] })
		const trigger = (model: unknown) => evalsProblems({ trigger: [{ prompt: 'p', expect: 'fire', model }] })
		for (const model of ['mid', 'claude-sonnet-5-5', 'gpt-5.6-luna', 'sonnet[1m]']) {
			expect(outcome(model)).toEqual([])
			expect(trigger(model)).toEqual([])
		}
		for (const model of ['', 'a b', '--x', 3]) {
			expect(outcome(model)).toEqual(['outcome case 1: `model` is not a tier or a model ID'])
			expect(trigger(model)).toEqual(['trigger case 1: `model` is not a tier or a model ID'])
		}
	})

	it('names each format problem', () => {
		expect(
			evalsProblems({
				runs: 0,
				trigger: [{ prompt: 'x', expect: 'maybe' }],
				outcome: [{ id: 'a', prompt: 'p', effects: 'inside', criteria: [1] }],
				rubrics: { C1: [{ smells: 'good' }], C2: [] },
			}),
		).toEqual([
			'`runs` is not a positive whole number',
			'trigger case 1 needs a `prompt` and `expect: fire` or `skip`',
			'outcome case 1: `criteria` is not a list of IDs',
			'outcome case 1: `effects` is not `outside`',
			'rubric C1 has a check that is not one of contains, not-contains, regex, not-regex, file-exists, file-contains, script, judge',
			'rubric C2 is not a list of checks',
		])
	})

	it('names a malformed per-case checks (F6)', () => {
		expect(
			evalsProblems({
				outcome: [
					{ id: 'a', prompt: 'p', checks: [] },
					{ id: 'b', prompt: 'p', checks: { C1: [], C2: [{ smells: 'x' }] } },
				],
			}),
		).toEqual([
			'outcome case 1: `checks` is not a mapping of criterion IDs',
			'outcome case 2: checks C1 is not a list of checks',
			'outcome case 2: checks C2 has a check that is not one of contains, not-contains, regex, not-regex, file-exists, file-contains, script, judge',
		])
	})

	it('counts a criterion as having a rubric when every case testing it has checks, and rejects unknown IDs in checks (F6)', () => {
		const run = (evals: string) =>
			byId(checkVerification(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals })))['VER-3']
		const noC2 = goodEvals.replace(/ {2}C2:\n.*\n/, '')
		expect(run(noC2)).toMatchObject({ status: 'fail', message: 'no rubric for C2' })
		const withChecks = noC2.replace(
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs }',
			'  - id: two-prs\n    prompt: write the notes\n    files: files/two-prs\n    criteria: [C1, C2]\n    checks:\n      C2:\n        - contains: ok',
		)
		expect(withChecks).not.toBe(noC2)
		expect(run(withChecks)).toMatchObject({ status: 'pass' })
		const unknownId = withChecks.replace(
			'        - contains: ok',
			'        - contains: ok\n      C9:\n        - contains: ok',
		)
		expect(run(unknownId)).toMatchObject({ status: 'fail', message: 'checks C9 name no criterion' })
	})

	it('fails too few trigger cases, uncovered or unknown rubrics, missing files, and a threshold over runs', () => {
		const evals = goodEvals
			.replace(/ {2}- \{ prompt: review my diff, expect: skip \}\n/, '')
			.replace('  C2:\n', '  C9:\n')
			.replace('files/two-prs', 'files/none')
			.replace('trigger:', 'runs: 2\nthreshold: 3\ntrigger:')
		const outcomes = byId(checkVerification(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals })))
		expect(outcomes['VER-2']).toMatchObject({ status: 'fail', message: '3 `fire` and 2 `skip` trigger cases' })
		expect(outcomes['VER-3']).toMatchObject({
			status: 'fail',
			message: 'no rubric for C2; rubric C9 names no criterion',
		})
		expect(outcomes['VER-4']).toMatchObject({ status: 'fail', message: expect.stringContaining('evals/files/none') })
		expect(outcomes['VER-5']).toMatchObject({ status: 'fail' })
	})
	it('fails a setup script that does not exist (VER-4)', () => {
		const evals = goodEvals.replace('files: files/two-prs', 'files: files/two-prs, setup: setup/none.sh')
		expect(byId(checkVerification(goodSkill({ 'evals/evals.yaml': evals })))['VER-4']).toMatchObject({
			status: 'fail',
			message: 'case two-prs: setup script evals/setup/none.sh does not exist',
		})
		const present = goodSkill({ 'evals/evals.yaml': evals, 'evals/setup/none.sh': 'true\n' })
		expect(byId(checkVerification(present))['VER-4']).toEqual({ id: 'VER-4', status: 'pass' })
	})

	it('flags a prompt that tells the model to run a setup script, and passes a plain request (VER-9)', () => {
		for (const prompt of [
			'Run `sh setup.sh` once; it prepares this repository. Then commit the parser change.',
			'First execute ./prepare-repo.sh, then commit',
			'source scaffold.bash and write the notes',
		]) {
			const evals = goodEvals.replace('prompt: write the notes', `prompt: ${JSON.stringify(prompt)}`)
			expect(byId(checkVerification(goodSkill({ 'evals/evals.yaml': evals })))['VER-9']).toMatchObject({
				status: 'fail',
				message: "case two-prs: the prompt tells the model to run a setup script; move it to the case's `setup`",
			})
		}
		const plain = goodEvals.replace('prompt: write the notes', 'prompt: "run the tests, then commit the setup changes"')
		expect(byId(checkVerification(goodSkill({ 'evals/evals.yaml': plain })))['VER-9']).toEqual({
			id: 'VER-9',
			status: 'pass',
		})
	})

	it('flags a text check that is a punctuation mark alone, in a rubric or a case, and passes one with words (VER-11)', () => {
		const rubric = goodEvals.replace('- contains: "## Release notes"', '- regex: "\\\\?\\\\s*$"')
		expect(byId(checkVerification(goodSkill({ 'evals/evals.yaml': rubric })))['VER-11']).toMatchObject({
			status: 'fail',
			message: 'rubric C1: `regex: \\?\\s*$` tests a punctuation mark alone; test what the outcome left behind',
		})
		const perCase = goodEvals.replace(
			'files: files/two-prs',
			'files: files/two-prs, checks: { C2: [{ not-contains: "?" }] }',
		)
		expect(byId(checkVerification(goodSkill({ 'evals/evals.yaml': perCase })))['VER-11']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('case two-prs: checks C2: `not-contains: ?`'),
		})
		const options = goodEvals.replace(
			'- contains: "## Release notes"',
			'- regex: "\\\\?|(^|\\\\n)[ \\\\t]*\\\\(?[Aa][.)]"',
		)
		expect(byId(checkVerification(goodSkill({ 'evals/evals.yaml': options })))['VER-11']).toEqual({
			id: 'VER-11',
			status: 'pass',
		})
	})

	it('flags a setup script line that writes .git/hooks or repository git config, and passes --global (VER-12)', () => {
		const evals = goodEvals.replace('files: files/two-prs', 'files: files/two-prs, setup: setup/two-prs.sh')
		const setup = [
			'#!/bin/sh',
			'# cp hooks/commit-msg .git/hooks/commit-msg is a comment',
			'git config --global core.hooksPath "$PWD/hooks"',
			'cp hooks/commit-msg .git/hooks/commit-msg',
			'git config user.name tester',
			'',
		].join('\n')
		expect(
			byId(checkVerification(goodSkill({ 'evals/evals.yaml': evals, 'evals/setup/two-prs.sh': setup })))['VER-12'],
		).toMatchObject({
			status: 'fail',
			message: expect.stringMatching(
				/^case two-prs: evals\/setup\/two-prs\.sh line 4: `cp hooks\/commit-msg \.git\/hooks\/commit-msg`; case two-prs: evals\/setup\/two-prs\.sh line 5: `git config user\.name tester` writes .*core\.hooksPath/,
			),
		})
		const clean = 'git config --global user.name tester\ngit config --get user.name\n'
		expect(
			byId(checkVerification(goodSkill({ 'evals/evals.yaml': evals, 'evals/setup/two-prs.sh': clean })))['VER-12'],
		).toEqual({ id: 'VER-12', status: 'pass' })
	})

	it('finds the lines of a setup script that write under .git/hooks or to .git/config (VER-12)', () => {
		const flagged = [
			'cp hooks/pre-commit .git/hooks/',
			'ln -s ../../hooks/pre-commit .git/hooks/pre-commit',
			'chmod +x .git/hooks/pre-commit',
			'mkdir -p .git/hooks',
			'echo "exit 0" > .git/hooks/pre-commit',
			"printf '[user]\\n' >> .git/config",
			'cat <<EOF > .git/hooks/commit-msg',
			'git config user.email a@example.com',
			'git config --local core.hooksPath hooks',
			'git -C repo config commit.gpgsign false',
			'git config --unset user.name',
			'git config set user.name tester',
			'git add . && git config user.name tester && git commit -m start',
		]
		for (const line of flagged) expect(gitWriteLines(line), line).toEqual([`line 1: \`${line}\``])
		const passed = [
			'git config --global user.name tester',
			'git config --system core.autocrlf false',
			'git config --file other.cfg user.name tester',
			'git config user.name',
			'git config --get user.name',
			'git config --list',
			'test -f .git/hooks/pre-commit',
			'cat .git/config',
			'# git config user.name tester',
			'git commit -m "touch the config"',
		]
		for (const line of passed) expect(gitWriteLines(line), line).toEqual([])
	})

	it("maps rubric IDs to the criteria of a router skill's linked command files (#337)", () => {
		const outcomes = byId(checkVerification(makeSkill(routerSkillFiles)))
		expect(outcomes['VER-3']).toEqual({ id: 'VER-3', status: 'pass' })
		expect(outcomes['VER-13']).toEqual({ id: 'VER-13', status: 'pass' })
		const review = routerSkillFiles['references/review.md'].replace(/## Done when[\s\S]*/, '')
		expect(
			byId(checkVerification(makeSkill({ ...routerSkillFiles, 'references/review.md': review })))['VER-3'],
		).toMatchObject({ status: 'fail', message: 'rubric C3 names no criterion' })
	})
})

describe('trigger case IDs (R175, R186)', () => {
	it('warns VER-17 on each trigger case with no `id`, naming it by place', () => {
		const one = namedEvals.replace('id: skip-2, ', '')
		expect(byId(checkVerification(goodSkill({ 'evals/evals.yaml': one })))['VER-17']).toEqual({
			id: 'VER-17',
			status: 'fail',
			message: '1 trigger case has no `id` and is named by place: trigger-5',
			file: 'evals/evals.yaml',
		})
		expect(byId(checkVerification(goodSkill()))['VER-17']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('6 trigger cases have no `id`'),
		})
		expect(byId(checkVerification(goodSkill({ 'evals/evals.yaml': namedEvals })))['VER-17']).toEqual({
			id: 'VER-17',
			status: 'pass',
		})
	})

	it('rejects a trigger `id` that is not a plain case ID or takes the positional form', () => {
		expect(evalsProblems({ trigger: [{ id: 'a/b', prompt: 'p', expect: 'fire' }] })).toEqual([
			"trigger case 1: `id` \"a/b\" is not a case ID: use letters, digits, '.', '_', and '-', starting with a letter or digit",
		])
		expect(evalsProblems({ trigger: [{ id: 'trigger-2', prompt: 'p', expect: 'fire' }] })).toEqual([
			'trigger case 1: `id` trigger-2 takes the form a trigger case with no `id` is given from its place; pick another',
		])
	})

	it('rejects an ID that names more than one case, a positional one included', () => {
		expect(
			evalsProblems({
				trigger: [
					{ id: 'notes', prompt: 'p', expect: 'fire' },
					{ prompt: 'q', expect: 'skip' },
				],
				outcome: [
					{ id: 'notes', prompt: 'r' },
					{ id: 'trigger-2', prompt: 's' },
				],
			}),
		).toEqual(['case IDs notes, trigger-2 each name more than one case; give each case its own'])
	})
})
