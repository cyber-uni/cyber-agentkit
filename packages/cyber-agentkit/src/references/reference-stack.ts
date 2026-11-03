import { isRecord } from '../plugins/json-file.js'
import type { WarnFn } from './reference-codes.js'
import type { Contribution } from './reference-contribution.js'
import { isMergeOperation, type MergeOperation } from './reference-document.js'
import { namePattern, type ReferenceName } from './reference-name.js'
import type { AmbiguousCause, OperationSource } from './resolve-reference.js'

/** One `sections` entry of a step: a top-level heading, and the operation it applies with when one is written. */
export type StepSection = { heading: string; merge?: MergeOperation }

/**
 * One `extends` entry: a plugin or `default`, with the keys to use for it in place of its own. With
 * `sections`, it contributes only those top-level sections (R52).
 */
export type ExtendsStep = { target: string; merge?: MergeOperation; extends?: ExtendsStep[]; sections?: StepSection[] }

/** Reads `extends`: a plugin or `default` per step, bottom first. `undefined` when it is not written or malformed. */
export function readExtends(value: unknown, warn: WarnFn): ExtendsStep[] | undefined {
	if (value === undefined) return undefined
	const malformed = (why: string) => {
		warn('extends-invalid', `\`extends\` ${why}; it is read as not written`)
		return undefined
	}
	const list: unknown[] | undefined = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined
	if (!list) return malformed('is not a list of plugins')
	const steps: ExtendsStep[] = []
	for (const item of list) {
		const step = readStep(item, warn)
		if (typeof step === 'string') return malformed(step)
		steps.push(step)
	}
	return steps
}

const stepKeys: readonly string[] = ['merge', 'extends', 'sections']

function readStep(item: unknown, warn: WarnFn): ExtendsStep | string {
	if (typeof item === 'string') {
		return namePattern.test(item) ? { target: item } : `names "${item}", which is not a plugin name or default`
	}
	if (!isRecord(item) || Object.keys(item).length !== 1) return `holds ${JSON.stringify(item)}, which is not a step`
	const [target, keys] = Object.entries(item)[0] as [string, unknown]
	if (!namePattern.test(target)) return `names "${target}", which is not a plugin name or default`
	if (keys === null || keys === undefined) return { target }
	const step: ExtendsStep = { target }
	if (typeof keys === 'string') {
		step.merge = readStepMerge(keys, target, warn)
		return step
	}
	if (!isRecord(keys) || Object.keys(keys).some((key) => !stepKeys.includes(key))) {
		return `gives "${target}" keys other than merge, extends, and sections`
	}
	if (keys['merge'] !== undefined) step.merge = readStepMerge(keys['merge'], target, warn)
	if (keys['extends'] !== undefined) {
		const nested = readExtends(keys['extends'], warn)
		if (!nested) return `gives "${target}" a malformed extends`
		step.extends = nested
	}
	if (keys['sections'] !== undefined) {
		const sections = readStepSections(keys['sections'], target, warn)
		if (!sections) return `gives "${target}" sections that are not a list of headings`
		step.sections = sections
	}
	return step
}

/** A step's `sections`: each a heading, or `{<heading>: <operation>}` for one applying with its own operation. */
function readStepSections(value: unknown, target: string, warn: WarnFn): StepSection[] | undefined {
	const list = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined
	if (!list) return undefined
	const sections: StepSection[] = []
	for (const item of list) {
		if (typeof item === 'string' && item.trim()) {
			sections.push({ heading: item.trim() })
			continue
		}
		if (!isRecord(item) || Object.keys(item).length !== 1) return undefined
		const [heading, merge] = Object.entries(item)[0] as [string, unknown]
		if (!heading.trim()) return undefined
		const section: StepSection = { heading: heading.trim() }
		if (merge !== null && merge !== undefined) section.merge = readStepMerge(merge, `${target} > ${heading}`, warn)
		sections.push(section)
	}
	return sections
}

function readStepMerge(value: unknown, target: string, warn: WarnFn): MergeOperation {
	if (isMergeOperation(value)) return value
	warn('merge-unknown', `unknown merge "${String(value)}" on the step ${target}; read as patch`)
	return 'patch'
}

export type StackEntry = {
	target: string
	contribution: Contribution
	operation: MergeOperation
	from: OperationSource
	/** The step's `sections`: only these top-level sections are contributed (R52). */
	sections?: StepSection[]
}

type Ambiguity = { cause: AmbiguousCause; message: string }

type Expansion = {
	entries: StackEntry[]
	/** The steps that could not be used, each with why. */
	missing: { target: string; reason: string }[]
	/** Every listed step was missing: the `extends` counts as not written. */
	allMissing: boolean
	/** Plugins a step's own `extends` would have brought in, had the step not replaced it. */
	replaced: { target: string; step: string }[]
	ambiguous?: Ambiguity
}

export type Lookup = (target: string) => Contribution | { reason: string }

/**
 * Expands a list of steps bottom first: each step brings its own `extends` beneath it, recursively.
 * Under a written list (`written`), bringing in stops silently at a plugin already in the stack;
 * among the plugins' own `extends`, a cycle makes the name ambiguous.
 */
function expand(top: readonly ExtendsStep[], owner: string, mode: 'written' | 'plugins', lookup: Lookup, warn: WarnFn) {
	const result: Expansion = { entries: [], missing: [], allMissing: false, replaced: [] }
	const placed = new Set<string>()
	const inProgress = new Set<string>()
	const normalize = (steps: readonly ExtendsStep[], who: string, self?: string): ExtendsStep[] => {
		const out: ExtendsStep[] = []
		for (const step of steps) {
			if (step.target === self) {
				warn('extends-self', `${who} lists itself in its extends; that entry is ignored`)
				continue
			}
			if (out.at(-1)?.target === step.target) continue
			if (out.some(({ target }) => target === step.target) && !result.ambiguous) {
				result.ambiguous = { cause: 'repeat', message: `${who}'s extends lists ${step.target} at two places` }
			}
			out.push(step)
		}
		return out
	}
	const listed = normalize(top, owner)
	const listedTargets = new Set(listed.map(({ target }) => target))
	const visit = (step: ExtendsStep, isTop: boolean, chain: readonly string[]) => {
		if (result.ambiguous || placed.has(step.target)) return
		if (inProgress.has(step.target)) {
			if (mode === 'plugins') {
				result.ambiguous = {
					cause: 'cycle',
					message: `the plugins' own extends form a cycle: ${[...chain, step.target].join(' → ')}`,
				}
			}
			return
		}
		if (!isTop && listedTargets.has(step.target)) return
		const found = lookup(step.target)
		if ('reason' in found) {
			result.missing.push({ target: step.target, reason: found.reason })
			if (step.target !== 'default') {
				warn(
					'extends-step-missing',
					`the step ${step.target} in ${chain.at(-1) ?? owner}'s extends ${found.reason}; it is skipped`,
				)
			}
			return
		}
		inProgress.add(step.target)
		const own = found.steps ?? []
		if (step.extends) {
			const kept = new Set(step.extends.map(({ target }) => target))
			for (const { target } of own) if (!kept.has(target)) result.replaced.push({ target, step: step.target })
		}
		for (const sub of normalize(step.extends ?? own, `plugin ${step.target}`, step.target)) {
			visit(sub, false, [...chain, step.target])
		}
		inProgress.delete(step.target)
		const operation = step.merge ?? found.merge ?? 'patch'
		const from: OperationSource = step.merge ? 'step' : found.merge ? 'contribution' : 'default'
		const entry: StackEntry = { target: step.target, contribution: found, operation, from }
		if (step.sections) entry.sections = step.sections
		result.entries.push(entry)
		placed.add(step.target)
	}
	for (const step of listed) visit(step, true, [])
	result.allMissing =
		listed.length > 0 &&
		listed.every(({ target }) => !placed.has(target)) &&
		listed.some(({ target }) => target !== 'default')
	return result
}

export type Plan = {
	entries: StackEntry[]
	builtBy: string
	/** Plugins a step's own `extends` would have brought in, and the step that replaced it. */
	replaced: { target: string; step: string }[]
	/** Who replaced a step's own `extends`, for the trace. */
	replacedBy: string
}

export type Failure = { status: 'missing' | 'ambiguous'; message: string; cause?: AmbiguousCause }

const noWarn: WarnFn = () => {}

/**
 * Decides the stack: the highest written `extends` in the managed, repo, and user tiers; else
 * the plugins' own `extends`; for a qualified name, that plugin's own stack.
 */
export function plan(
	ref: ReferenceName,
	tiered: readonly Contribution[],
	holders: ReadonlyMap<string, Contribution>,
	lookup: Lookup,
	defaultContribution: Contribution | undefined,
	warn: WarnFn,
): Plan | Failure {
	let built: (Plan & { builder: Contribution; targets: string }) | undefined
	for (const contribution of tiered) {
		if (!contribution.steps) continue
		if (ref.plugin !== undefined) {
			contribution.entry.extendsOutcome = 'not used (qualified name)'
			continue
		}
		if (built) {
			const lower = expand(contribution.steps, contribution.label, 'written', lookup, noWarn)
			if (lower.entries.map(({ target }) => target).join(' ') !== built.targets) {
				contribution.entry.extendsOutcome = `not used (${built.builder.label}'s extends builds the stack)`
				warn(
					'extends-not-used',
					`${contribution.label} builds a different stack from ${built.builder.label}, whose extends is used`,
				)
			}
			continue
		}
		const expansion = expand(contribution.steps, contribution.label, 'written', lookup, warn)
		if (expansion.ambiguous) return { status: 'ambiguous', ...expansion.ambiguous }
		if (expansion.allMissing) {
			contribution.entry.extendsOutcome = 'not used (every step is missing)'
			warn('extends-all-missing', `every step in ${contribution.label}'s extends is missing; it is read as not written`)
			continue
		}
		built = {
			entries: expansion.entries,
			builtBy: contribution.label,
			replaced: expansion.replaced,
			replacedBy: contribution.label,
			builder: contribution,
			targets: expansion.entries.map(({ target }) => target).join(' '),
		}
	}
	if (built) return built
	if (ref.plugin !== undefined) {
		const found = lookup(ref.plugin)
		if ('reason' in found) return { status: 'missing', message: `the plugin ${ref.plugin} ${found.reason}` }
		const expansion = expand([{ target: ref.plugin }], `plugin ${ref.plugin}`, 'plugins', lookup, warn)
		if (expansion.ambiguous) return { status: 'ambiguous', ...expansion.ambiguous }
		return { entries: expansion.entries, builtBy: 'qualified name', replaced: [], replacedBy: '' }
	}
	return planFromPlugins(holders, lookup, defaultContribution, ref.name, warn)
}

function planFromPlugins(
	holders: ReadonlyMap<string, Contribution>,
	lookup: Lookup,
	defaultContribution: Contribution | undefined,
	name: string,
	warn: WarnFn,
): Plan | Failure {
	const defaultEntry = (): StackEntry[] =>
		defaultContribution
			? [
					{
						target: 'default',
						contribution: defaultContribution,
						operation: defaultContribution.merge ?? 'patch',
						from: defaultContribution.merge ? 'contribution' : 'default',
					},
				]
			: []
	const names = [...holders.keys()]
	if (!names.length) return { entries: defaultEntry(), builtBy: 'none', replaced: [], replacedBy: '' }
	const reach = new Map<string, Set<string>>()
	for (const holder of names) {
		const closure = expand([{ target: holder }], `plugin ${holder}`, 'plugins', lookup, noWarn)
		if (closure.ambiguous) return { status: 'ambiguous', ...closure.ambiguous }
		reach.set(holder, new Set(closure.entries.map(({ target }) => target).filter((target) => target !== holder)))
	}
	const tops = names.filter((holder) => !names.some((other) => other !== holder && reach.get(other)?.has(holder)))
	const unordered = (): Failure => ({
		status: 'ambiguous',
		cause: 'unordered',
		message: `the plugins ${names.join(', ')} hold it, and no extends orders them`,
	})
	if (tops.length !== 1) return unordered()
	const top = tops[0] as string
	const expansion = expand([{ target: top }], `plugin ${top}`, 'plugins', lookup, warn)
	if (expansion.ambiguous) return { status: 'ambiguous', ...expansion.ambiguous }
	const placed = new Set(expansion.entries.map(({ target }) => target))
	if (names.some((holder) => !placed.has(holder))) return unordered()
	const entries = expansion.entries
	if (defaultContribution && !placed.has('default')) {
		entries.unshift(...defaultEntry())
		const plugins = names.join(', ')
		warn(
			'default-not-selected',
			`${names.length > 1 ? 'the plugins' : 'the plugin'} ${plugins} ${names.length > 1 ? 'answer' : 'answers'} over the default of ${defaultContribution.layer.skill}, and no extends names either; run "reference customize ${name} --extends <option>..." to choose (options: ${[...names, 'default'].join(', ')})`,
		)
	}
	const builtBy = top && (holders.get(top)?.steps?.length ?? 0) > 0 ? `plugin ${top}'s extends` : 'none'
	return { entries, builtBy, replaced: [], replacedBy: '' }
}

export function namesDefault(steps: readonly ExtendsStep[] | undefined): boolean {
	return (steps ?? []).some((step) => step.target === 'default' || namesDefault(step.extends))
}
