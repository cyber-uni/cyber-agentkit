import { existsSync, readFileSync } from 'node:fs'
import { type AttestationView, attestationsIn, skillFingerprint, viewAttestations } from './attestation.js'
import { expectedView } from './expected-result.js'
import { criteriaFiles, readText, type SkillFiles } from './skill-files.js'
import { acceptedHistory, expectedPath } from './skill-test.js'
import type { Carried, KnownFailure, NotRun, RatePoint, SandboxFailure, Status, TestResult } from './test-result.js'
import { compareWithHistory, notRunKind } from './test-result.js'

/** Where `skill test` is documented; the Markdown links it when it says how a result is saved. */
export const defaultTestLink = 'https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/skills/skill/'

export type Count = { passed: number; ran: number }

/** A skill's accepted eval results, laid out for docs: `skill report` prints it as JSON, or as Markdown by `reportMarkdown`. */
export type EvalReport = {
	skill: string
	/**
	 * False when the skill has no accepted run result in `evals/expected.json`; every other field but `skill` and `attested`
	 * is then left out.
	 */
	hasResult: boolean
	/**
	 * The passes the author recorded from the skill's real use instead of a run (#323), each with its evidence and no
	 * pass rate; `stale` when the skill changed since it was recorded. Left out when there is none.
	 */
	attested?: AttestationView[]
	at?: string
	/** The oldest date of the case entries, when they were recorded at different times (R182); `at` is the newest write. */
	oldest?: string
	runs?: number
	threshold?: number
	/** `without the skill` when the baseline ran; otherwise why it did not. */
	baseline?: string
	baselineRan?: boolean
	/**
	 * The model the cases ran on unless one names its own (R161), `default` when the harness picked it; left out for a
	 * result saved before it was recorded.
	 */
	model?: string
	/** The model that graded the `judge` checks (#357); left out when none ran. */
	judge?: string
	/** The cases that ran on a model of their own, each with it (R161). */
	caseModels?: { case: string; model: string }[]
	/** US dollars, for `totalRuns` runs when the result records them. Results record no tokens. */
	cost?: number
	totalRuns?: number
	/**
	 * The criterion checks that passed with the skill and without it, over the criteria the baseline scored too, leaving
	 * out guard criteria (R160): they are expected to pass without the skill.
	 */
	gap?: { with: Count; without: Count }
	trigger?: { case: string; prompt: string; expect: 'fire' | 'skip'; fired: number; ran: number; result: string }[]
	/** Each criterion, largest gap over the baseline first; `text` is its line in the `SKILL.md` `## Done when`. */
	criteria?: {
		id: string
		text?: string
		status: Status
		reason?: string
		with?: Count
		without?: Count
		/** Every case that tests it is a regression guard (R160). */
		guard?: true
		/** The oldest date of the entries it is computed from, when they were recorded at different times (R182). */
		recorded?: string
		/** Set when an entry it is computed from was carried forward, not run (R183). */
		carried?: true
		result: string
	}[]
	/** The outcome cases: every case that is not a trigger case. A guard counts its baseline runs that passed (R160). */
	cases?: {
		case: string
		status: Status
		passed?: number
		ran?: number
		sandboxFailed?: number
		guard?: true
		baseline?: Count
		/** When its entry was recorded (R181). */
		at?: string
		/** Set when its entry was carried forward without a run, with why (R183). */
		carried?: Carried
		result: string
	}[]
	notRun?: NotRun[]
	/**
	 * The marks of known failures the run judged (#329), each with its reason; a known failure shows as
	 * `known failure (<reason>)`, never as a pass rate. Left out when there is none.
	 */
	knownFailures?: KnownFailure[]
	/** The runs the test sandbox broke, in either arm; they count toward no pass rate. */
	sandboxFailures?: SandboxFailure[]
	/** The kept accepted results, oldest first, the expected one last; left out with fewer than two. */
	trend?: { at: string; cost?: number; totalRuns?: number; with?: Count; without?: Count }[]
	/** The cases whose pass rate moved across `trend`, each with its rate in each result that holds one. */
	moved?: { case: string; rates: RatePoint[] }[]
}

/** The criterion text in a `SKILL.md` body's `## Done when`, by ID: `- **C1.** text`. */
export function doneWhenCriteria(body: string): Record<string, string> {
	const lines = body.split('\n')
	const start = lines.indexOf('## Done when')
	if (start < 0) return {}
	const criteria: Record<string, string> = {}
	let current: string | undefined
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith('## ')) break
		const item = /^- \*\*(C\d+)\.\*\*\s*(.*)$/.exec(line)
		if (item) {
			current = item[1] as string
			criteria[current] = item[2] as string
		} else if (current && /^\s+\S/.test(line)) {
			criteria[current] += ` ${line.trim()}`
		} else {
			current = undefined
		}
	}
	return criteria
}

/**
 * The criterion text of a skill by ID: its `SKILL.md` `## Done when`, then the `## Done when` of each reference file its
 * body links (#337). A repeated ID keeps its first text.
 */
export function skillCriteria(skill: SkillFiles): Record<string, string> {
	const criteria: Record<string, string> = {}
	for (const file of criteriaFiles(skill)) {
		const text = file === 'SKILL.md' ? skill.body : readText(skill, file)?.replace(/\r\n/g, '\n')
		if (text === undefined) continue
		for (const [id, line] of Object.entries(doneWhenCriteria(text))) if (!(id in criteria)) criteria[id] = line
	}
	return criteria
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** A status as a docs reader reads it: a case whose every run the sandbox broke is a `sandbox failure`, not a skill failure. */
function resultText(status: Status, sandboxFailed: number | undefined): string {
	if (!sandboxFailed) return status
	if (status === 'not-run') return 'sandbox failure'
	return `${status}, ${plural(sandboxFailed, 'sandbox failure')}`
}

/**
 * A guard case's result (R160): a pass with the skill that also passes without it is what a guard is for, so it reads
 * as expected; a fail with the skill is still a fail.
 */
function guardText(text: string, c: { status: Status; baseline?: Count }, threshold: number): string {
	if (c.status === 'pass' && c.baseline?.ran && c.baseline.passed >= Math.min(threshold, c.baseline.ran))
		return `${text}, and without the skill, as a guard should`
	return `${text} (guard)`
}

/** A carried entry as a reader reads it (R183): never a pass from a run. */
function carriedText(carried: Carried | undefined): string {
	return carried ? `; carried, not run (${carried.reason})` : ''
}

/** The criterion checks that passed with the skill and without, over the criteria the baseline scored, guards left out. */
function gapOf(result: TestResult): { with: Count; without: Count } | undefined {
	// A known failure counts toward no pass rate (#329).
	const compared = (result.criteria ?? []).filter(
		(c) => typeof c.passed === 'number' && c.baseline && !c.guard && c.status !== 'known-failure',
	)
	if (!compared.length) return undefined
	const sum = (pick: (c: (typeof compared)[number]) => number) => compared.reduce((total, c) => total + pick(c), 0)
	return {
		with: { passed: sum((c) => c.passed ?? 0), ran: sum((c) => c.ran ?? 0) },
		without: { passed: sum((c) => c.baseline?.passed ?? 0), ran: sum((c) => c.baseline?.ran ?? 0) },
	}
}

/**
 * The report on a skill's accepted results: `result` is its `evals/expected.json`, `history` its kept accepted results
 * oldest first with the expected one last (`acceptedHistory`), and `labels` each criterion's text by ID.
 */
export function evalReport(
	skill: string,
	result: TestResult | undefined,
	{
		labels = {},
		history = [],
		attested = [],
	}: { labels?: Record<string, string>; history?: TestResult[]; attested?: AttestationView[] } = {},
): EvalReport {
	const attestedOf = attested.length ? { attested } : {}
	if (!result) return { skill, hasResult: false, ...attestedOf }
	const attestedIn = (id: string) => attested.find((entry) => entry.case === undefined && entry.id === id)
	const brokenIn = new Map((result.cases ?? []).map((c) => [c.case, c.sandboxFailed]))
	const carriedIn = new Map((result.cases ?? []).flatMap((c) => (c.carried ? [[c.case, c.carried] as const] : [])))
	const report: EvalReport = {
		skill,
		hasResult: true,
		at: result.at,
		runs: result.runs,
		threshold: result.threshold,
		baseline: result.baseline,
		baselineRan: result.baseline === 'without the skill',
		...attestedOf,
	}
	const dates = [...new Set((result.cases ?? []).flatMap((c) => (c.at ? [c.at] : [])))].sort()
	if (dates.length > 1) report.oldest = dates[0] as string
	if (result.model) report.model = result.model
	if (result.judge) report.judge = result.judge
	const caseModels = (result.cases ?? []).flatMap((c) => (c.model ? [{ case: c.case, model: c.model }] : []))
	if (caseModels.length) report.caseModels = caseModels
	if (typeof result.cost === 'number') report.cost = result.cost
	if (typeof result.totalRuns === 'number') report.totalRuns = result.totalRuns
	const gap = gapOf(result)
	if (gap) report.gap = gap

	const known = (result.knownFailures ?? []).filter((k) => k.status === 'known-failure')
	if (result.knownFailures?.length) report.knownFailures = result.knownFailures
	/** `known failure (<reasons>)` for the marks of a case, or of a criterion, that the run found still failing (#329). */
	const knownText = (marks: KnownFailure[]) =>
		`known failure (${[...new Set(marks.map((k) => k.reason))].join('; ') || 'marked'})`
	const trigger = result.trigger ?? []
	report.trigger = trigger.map((t) => ({
		case: t.case,
		prompt: t.prompt,
		expect: t.expect,
		fired: t.fired,
		ran: t.ran,
		result: `${
			t.status === 'known-failure'
				? knownText(known.filter((k) => k.case === t.case))
				: resultText(t.status, brokenIn.get(t.case))
		}${carriedText(carriedIn.get(t.case))}`,
	}))

	const rate = (count: Count) => count.passed / count.ran
	const gapOfCriterion = (c: TestResult['criteria'][number]) =>
		c.baseline && typeof c.passed === 'number'
			? rate({ passed: c.passed, ran: c.ran ?? 0 }) - rate(c.baseline)
			: Number.NEGATIVE_INFINITY
	report.criteria = (result.criteria ?? [])
		.map((c, i) => ({ c, i }))
		.sort((a, b) => gapOfCriterion(b.c) - gapOfCriterion(a.c) || a.i - b.i)
		.map(({ c }) => ({ c, seen: attestedIn(c.id) }))
		.map(({ c, seen }) => ({
			id: c.id,
			...(labels[c.id] ? { text: labels[c.id] } : {}),
			status: c.status,
			...(c.reason ? { reason: c.reason } : {}),
			...(typeof c.passed === 'number' ? { with: { passed: c.passed, ran: c.ran ?? 0 } } : {}),
			...(typeof c.passed === 'number' && c.baseline ? { without: c.baseline } : {}),
			...(c.guard ? { guard: true as const } : {}),
			result: `${
				c.status === 'known-failure'
					? knownText(known.filter((k) => k.criterion === c.id))
					: c.guard
						? guardText(
								c.status,
								{ status: c.status, ...(c.baseline ? { baseline: c.baseline } : {}) },
								result.threshold,
							)
						: typeof c.passed === 'number'
							? c.status
							: `${c.status}${c.reason ? `: ${c.reason}` : ''}`
			}${c.carried ? '; carried, not run' : ''}${c.recorded ? `; oldest entry ${c.recorded}` : ''}${seen ? `; attested${seen.stale ? ', stale: skill changed since' : ''} (${seen.evidence})` : ''}`,
			...(c.recorded ? { recorded: c.recorded } : {}),
			...(c.carried ? { carried: true as const } : {}),
		}))

	report.cases = (result.cases ?? [])
		.filter((c) => !trigger.some((t) => t.case === c.case))
		.map(({ criteria: _criteria, ...c }) => {
			if (c.status === 'known-failure')
				return {
					...c,
					result: `${knownText(known.filter((k) => k.case === c.case && k.criterion !== undefined))}${carriedText(c.carried)}`,
				}
			const text = resultText(c.status, c.sandboxFailed)
			return { ...c, result: `${c.guard ? guardText(text, c, result.threshold) : text}${carriedText(c.carried)}` }
		})
	report.notRun = result.notRun ?? []
	report.sandboxFailures = result.sandboxFailures ?? []

	if (history.length > 1) {
		report.trend = history.map((item) => {
			const point: NonNullable<EvalReport['trend']>[number] = { at: item.at }
			if (typeof item.cost === 'number') point.cost = item.cost
			if (typeof item.totalRuns === 'number') point.totalRuns = item.totalRuns
			const itemGap = gapOf(item)
			if (itemGap) Object.assign(point, itemGap)
			return point
		})
		const moved = compareWithHistory(history.at(-1) as TestResult, history.slice(0, -1)).moved
		if (moved) report.moved = moved
	}
	return report
}

/**
 * Reads the skill's accepted results from its folder: `evals/expected.json`, and the kept ones in `evals/accepted/` for
 * the trend. Throws when `evals/expected.json` exists but is not a saved result.
 */
export function readEvalReport(skill: string, folder: string, labels: Record<string, string>): EvalReport {
	const path = expectedPath(folder)
	if (!existsSync(path)) return evalReport(skill, undefined)
	let value: unknown
	try {
		value = JSON.parse(readFileSync(path, 'utf8'))
	} catch (error) {
		throw new Error(`${path} is not valid JSON: ${(error as Error).message}`)
	}
	const attested = viewAttestations(attestationsIn(value), skillFingerprint(folder))
	// The per-case form is read as a saved result, each criterion computed from its entries (R182).
	const result = expectedView(value)
	// A file that holds only attested passes (#323) has no run to report, only them.
	if (!result) {
		if (attested.length) return evalReport(skill, undefined, { attested })
		throw new Error(`${path} is not a saved test result: it has no \`at\` and no entries`)
	}
	return evalReport(skill, result, { labels, history: acceptedHistory(folder), attested })
}

const cell = (text: unknown) =>
	String(text)
		.replaceAll('|', '\\|')
		.replace(/\s*\n\s*/g, ' ')
const ratio = (count: Count) => `${count.passed} of ${count.ran}`
const dollars = (cost: number, runs: number | undefined) =>
	`$${cost.toFixed(2)}${typeof runs === 'number' ? ` for ${runs} runs` : ''}`

/**
 * The report as Markdown, starting at its `## Evals` heading, ready to paste into a docs page or a README. `testLink`
 * is where the page links `skill test`.
 */
export function reportMarkdown(report: EvalReport, { testLink = defaultTestLink }: { testLink?: string } = {}): string {
	const out = ['## Evals', '']
	if (!report.hasResult) {
		out.push(
			`This skill has no saved eval ${report.attested ? 'run' : 'result'} yet. [\`skill test\`](${testLink}) saves one when its author accepts a run.`,
			'',
		)
		out.push(...attestedMarkdown(report.attested))
		return out.join('\n')
	}
	const runs = report.runs ?? 0
	out.push(
		`Tested ${report.oldest ? `${report.oldest.slice(0, 10)} to ` : ''}${String(report.at).slice(0, 10)}: ${plural(runs, 'run')} per case, passes at ${report.threshold} of ${runs}, ${
			report.baselineRan
				? 'against the same prompts without the skill.'
				: `with no baseline to compare (${report.baseline ?? 'none recorded'}).`
		}`,
		'',
	)
	if (report.model) {
		const own = (report.caseModels ?? []).map((c) => `\`${cell(c.case)}\` on \`${cell(c.model)}\``)
		out.push(
			`${report.model === 'default' ? "The cases ran on the harness's default model" : `The cases ran on \`${cell(report.model)}\``}${own.length ? `, except ${own.join(', ')}` : ''}.`,
			'',
		)
	}
	if (report.judge)
		out.push(
			report.judge === 'default'
				? "The harness's default model graded the `judge` checks."
				: `A judge, \`${cell(report.judge)}\`, graded the \`judge\` checks.`,
			'',
		)
	if (typeof report.cost === 'number')
		out.push(`The run cost ${dollars(report.cost, report.totalRuns)}, with the skill and without.`, '')
	if (report.gap)
		out.push(
			`**What the skill adds:** with the skill, ${ratio(report.gap.with)} criterion checks pass; without it, ${ratio(report.gap.without)}.`,
			'',
		)

	const guards = (report.criteria ?? []).filter((c) => c.guard).map((c) => c.id)
	if (guards.length || report.cases?.some((c) => c.guard))
		out.push(
			`A guard case keeps a behavior that passes without the skill too, so a pass on both sides is expected there, and a fail with the skill is still a fail.${
				report.gap && guards.length
					? ` The line above leaves out the criteria only guard cases test: ${guards.join(', ')}.`
					: ''
			}`,
			'',
		)

	if (report.trigger?.length) {
		out.push(
			'### Trigger cases',
			'',
			'Whether the skill loads for each prompt, or stays out of it.',
			'',
			'| Prompt | Should | Fired | Result |',
			'| --- | --- | --- | --- |',
		)
		for (const t of report.trigger)
			out.push(
				`| ${cell(t.prompt)} | ${t.expect === 'fire' ? 'fire' : 'stay out'} | ${t.result.startsWith('known failure') ? '—' : `${t.fired} of ${t.ran}`} | ${cell(t.result)} |`,
			)
		out.push('')
	}

	if (report.criteria?.length) {
		out.push(
			'### Outcome criteria',
			'',
			'Each criterion the skill must meet, scored over every run of the cases that test it, with the skill and without. The largest gap comes first.',
			'',
			'| Criterion | With the skill | Without | Result |',
			'| --- | --- | --- | --- |',
		)
		for (const c of report.criteria) {
			const label = c.text ? `**${c.id}.** ${cell(c.text)}` : `**${c.id}**`
			// A known failure shows its reason, never a pass rate (#329).
			const counted = c.status !== 'known-failure'
			out.push(
				`| ${label} | ${counted && c.with ? ratio(c.with) : '—'} | ${counted && c.without ? ratio(c.without) : '—'} | ${cell(c.result)} |`,
			)
		}
		out.push('')
	}

	if (report.cases?.length) {
		out.push('### Outcome cases', '', '| Case | Result |', '| --- | --- |')
		for (const c of report.cases) out.push(`| \`${cell(c.case)}\` | ${cell(c.result)} |`)
		out.push('')
	}

	if (report.trend) {
		out.push(
			'### Trend',
			'',
			`The last ${report.trend.length} accepted results, oldest first.`,
			'',
			'| Accepted | With the skill | Without | Cost |',
			'| --- | --- | --- | --- |',
		)
		for (const point of report.trend)
			out.push(
				`| ${point.at.slice(0, 10)} | ${point.with ? ratio(point.with) : '—'} | ${point.without ? ratio(point.without) : '—'} | ${
					typeof point.cost === 'number' ? dollars(point.cost, point.totalRuns) : '—'
				} |`,
			)
		out.push('')
		if (report.moved?.length)
			out.push(
				`Cases whose pass rate moved: ${report.moved
					.map((m) => `\`${m.case}\` (${m.rates.map((r) => `${r.passed} of ${r.ran}`).join(', then ')})`)
					.join('; ')}.`,
				'',
			)
	}

	out.push(...attestedMarkdown(report.attested))
	out.push(...knownFailuresMarkdown(report.knownFailures))

	const notRunOf = (kind: 'skipped' | 'failed') => (report.notRun ?? []).filter((n) => notRunKind(n) === kind)
	const listed = (entries: NotRun[]) => entries.map((n) => `\`${n.case}\` (${n.reason})`).join('; ')
	if (notRunOf('skipped').length)
		out.push(`Skipped before running, and not counted as a pass: ${listed(notRunOf('skipped'))}.`, '')
	if (notRunOf('failed').length)
		out.push(`Failed to run, and not counted as a pass: ${listed(notRunOf('failed'))}.`, '')
	if (report.sandboxFailures?.length) {
		const arm = (f: SandboxFailure) => (f.arm === 'skill' ? 'with the skill' : 'without')
		out.push(
			`Sandbox failure, not counted as a pass or a fail: ${plural(report.sandboxFailures.length, 'run')} the test sandbox broke rather than the skill: ${report.sandboxFailures
				.map((f) => `\`${f.case}\` (${arm(f)}, run ${f.run}: ${f.fault})`)
				.join('; ')}.`,
			'',
		)
	}

	out.push(
		`The result is the skill's \`evals/expected.json\`, which [\`skill test\`](${testLink}) saves when its author accepts a run.`,
		'',
	)
	return out.join('\n')
}

/** The known failures' section (#329): each mark with its reason, and a mark the run passed as `fixed?`. */
function knownFailuresMarkdown(marks: KnownFailure[] | undefined): string[] {
	if (!marks?.length) return []
	const out = [
		'### Known failures',
		'',
		"Cases and criteria the skill's author marked as known to fail, with the reason. They count toward no pass rate.",
		'',
		'| Case | Criterion | Reason | Result |',
		'| --- | --- | --- | --- |',
	]
	for (const k of marks)
		out.push(
			`| \`${cell(k.case)}\` | ${k.criterion ? `**${cell(k.criterion)}**` : '—'} | ${cell(k.reason)} | ${k.status === 'fixed' ? 'fixed? the mark is out of date' : 'known failure'} |`,
		)
	out.push('')
	return out
}

/** The attested passes' section (#323): where each was seen, never a pass rate, and a stale one says so. */
function attestedMarkdown(attested: AttestationView[] | undefined): string[] {
	if (!attested?.length) return []
	const out = [
		'### Attested',
		'',
		"Passes the skill's author attested from its real use, not from a run, so they carry no pass rate.",
		'',
		'| Criterion or case | Evidence | Recorded | Note |',
		'| --- | --- | --- | --- |',
	]
	for (const entry of attested)
		out.push(
			`| ${entry.case !== undefined ? `\`${cell(entry.case)}\`` : `**${cell(entry.id)}**`} | [attested](${entry.evidence.replaceAll(')', '%29').replaceAll('|', '%7C')}) | ${entry.at.slice(0, 10)}${entry.by ? ` by ${cell(entry.by)}` : ''} | ${[entry.note ? cell(entry.note) : '', entry.stale ? 'stale: skill changed since' : ''].filter(Boolean).join('; ') || '—'} |`,
		)
	out.push('')
	return out
}
