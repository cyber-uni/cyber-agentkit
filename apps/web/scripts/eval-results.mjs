// Renders a skill's saved eval result (`evals/expected.json`, the shape the `skill` skill's test
// reference documents) as the Evals section of its docs page. It reads no file: the caller passes
// the parsed result, and the criteria's text when it has it. The renderer is meant to move into the
// plugin as is (cyber-agentkit#234), so it stays free of this site's generator.
//
// It shows pass counts and, when the result records it, what the run cost in US dollars.

const cell = (text) =>
	String(text)
		.replaceAll('|', '\\|')
		.replace(/\s*\n\s*/g, ' ')
const ratio = (passed, ran) => `${passed} of ${ran}`
const testLink = '/cyber-agentkit/packages/cyber-agentkit/skills/skill/'

/** The criterion text in a `SKILL.md` body's `## Done when`, by ID: `- **C1.** text`. */
export function doneWhenCriteria(body) {
	const lines = body.split('\n')
	const start = lines.findIndex((line) => line === '## Done when')
	if (start < 0) return {}
	const criteria = {}
	let current
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith('## ')) break
		const item = /^- \*\*(C\d+)\.\*\*\s*(.*)$/.exec(line)
		if (item) {
			current = item[1]
			criteria[current] = item[2]
		} else if (current && /^\s+\S/.test(line)) {
			criteria[current] += ` ${line.trim()}`
		} else {
			current = undefined
		}
	}
	return criteria
}

/**
 * The Evals section, as Markdown, starting at its `## Evals` heading.
 *
 * @param {object | undefined} result The parsed `evals/expected.json`, or undefined when the skill has none.
 * @param {{ criteria?: Record<string, string> }} [options] Each criterion's text by ID, to label the rows.
 */
export function renderEvals(result, { criteria: labels = {} } = {}) {
	const out = ['## Evals', '']
	if (!result) {
		out.push(
			`This skill has no saved eval result yet. [\`skill test\`](${testLink}) saves one when its author accepts a run.`,
			'',
		)
		return out.join('\n')
	}

	const hasBaseline = result.baseline === 'without the skill'
	const date = String(result.at).slice(0, 10)
	out.push(
		`Tested ${date}: ${result.runs} ${result.runs === 1 ? 'run' : 'runs'} per case, passes at ${ratio(result.threshold, result.runs)}, ${
			hasBaseline
				? 'against the same prompts without the skill.'
				: `with no baseline to compare (${result.baseline ?? 'none recorded'}).`
		}`,
		'',
	)
	if (typeof result.cost === 'number') {
		const runs = typeof result.totalRuns === 'number' ? ` for ${result.totalRuns} runs` : ''
		out.push(`The run cost $${result.cost.toFixed(2)}${runs}, with the skill and without.`, '')
	}

	const tested = (result.criteria ?? []).filter((c) => typeof c.passed === 'number')
	const compared = tested.filter((c) => c.baseline)
	if (compared.length) {
		const sum = (pick) => compared.reduce((total, c) => total + pick(c), 0)
		const ran = sum((c) => c.ran)
		const baseRan = sum((c) => c.baseline.ran)
		out.push(
			`**What the skill adds:** with the skill, ${ratio(
				sum((c) => c.passed),
				ran,
			)} criterion checks pass; without it, ${ratio(
				sum((c) => c.baseline.passed),
				baseRan,
			)}.`,
			'',
		)
	}

	const trigger = result.trigger ?? []
	if (trigger.length) {
		out.push(
			'### Trigger cases',
			'',
			'Whether the skill loads for each prompt, or stays out of it.',
			'',
			'| Prompt | Should | Fired | Result |',
			'| --- | --- | --- | --- |',
		)
		for (const t of trigger) {
			out.push(
				`| ${cell(t.prompt)} | ${t.expect === 'fire' ? 'fire' : 'stay out'} | ${ratio(t.fired, t.ran)} | ${t.status} |`,
			)
		}
		out.push('')
	}

	const rows = result.criteria ?? []
	if (rows.length) {
		const gap = (c) =>
			c.baseline && typeof c.passed === 'number'
				? c.passed / c.ran - c.baseline.passed / c.baseline.ran
				: Number.NEGATIVE_INFINITY
		const ordered = rows.map((c, i) => ({ c, i })).sort((a, b) => gap(b.c) - gap(a.c) || a.i - b.i)
		out.push(
			'### Outcome criteria',
			'',
			'Each criterion the skill must meet, scored over every run of the cases that test it, with the skill and without. The largest gap comes first.',
			'',
			'| Criterion | With the skill | Without | Result |',
			'| --- | --- | --- | --- |',
		)
		for (const { c } of ordered) {
			const label = labels[c.id] ? `**${c.id}.** ${cell(labels[c.id])}` : `**${c.id}**`
			if (typeof c.passed !== 'number') {
				out.push(`| ${label} | — | — | ${c.status}${c.reason ? `: ${cell(c.reason)}` : ''} |`)
				continue
			}
			const without = c.baseline ? ratio(c.baseline.passed, c.baseline.ran) : '—'
			out.push(`| ${label} | ${ratio(c.passed, c.ran)} | ${without} | ${c.status} |`)
		}
		out.push('')
	}

	const outcomeCases = (result.cases ?? []).filter((c) => !trigger.some((t) => t.case === c.case))
	if (outcomeCases.length) {
		out.push('### Outcome cases', '', '| Case | Result |', '| --- | --- |')
		for (const c of outcomeCases) out.push(`| \`${cell(c.case)}\` | ${c.status} |`)
		out.push('')
	}

	const notRun = result.notRun ?? []
	if (notRun.length) {
		out.push(`Not run, and not counted as a pass: ${notRun.map((n) => `\`${n.case}\` (${n.reason})`).join('; ')}.`, '')
	}

	out.push(
		`The result is the skill's \`evals/expected.json\`, which [\`skill test\`](${testLink}) saves when its author accepts a run.`,
		'',
	)
	return out.join('\n')
}
