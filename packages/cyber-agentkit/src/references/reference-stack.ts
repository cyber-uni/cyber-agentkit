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
export type ExtendsStep = {
	target: string
	/** The reference a `<plugin>/<reference>` step names; absent for a bare plugin, which takes the name of the file it sits in. */
	name?: string
	merge?: MergeOperation
	extends?: ExtendsStep[]
	sections?: StepSection[]
}

/** Reads a step's address: `<plugin>`, `default`, or `<plugin>/<reference>`; `undefined` when it is none of them. */
function readAddress(value: string): { target: string; name?: string } | undefined {
	const parts = value.split('/')
	if (parts.length === 1) return namePattern.test(value) ? { target: value } : undefined
	const [target, name] = parts as [string, string]
	if (parts.length !== 2 || target === 'default' || !namePattern.test(target) || !namePattern.test(name))
		return undefined
	return { target, name }
}

/** The step as it is written: `<plugin>`, or `<plugin>/<reference>`. */
export function stepLabel(step: Pick<ExtendsStep, 'target' | 'name'>): string {
	return step.name === undefined ? step.target : `${step.target}/${step.name}`
}

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
		const address = readAddress(item)
		return address ? address : `names "${item}", which is not a plugin name, default, or <plugin>/<reference>`
	}
	if (!isRecord(item) || Object.keys(item).length !== 1) return `holds ${JSON.stringify(item)}, which is not a step`
	const [written, keys] = Object.entries(item)[0] as [string, unknown]
	const address = readAddress(written)
	if (!address) return `names "${written}", which is not a plugin name, default, or <plugin>/<reference>`
	const target = stepLabel(address)
	if (keys === null || keys === undefined) return address
	const step: ExtendsStep = address
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
	/** The plugin, or `default`. */
	target: string
	/** The reference this entry's file answers: the name being resolved, or the one a `<plugin>/<reference>` step names. */
	name: string
	contribution: Contribution
	operation: MergeOperation
	from: OperationSource
	/** The step's `sections`: only these top-level sections are contributed (R52). */
	sections?: StepSection[]
}

/** How a stack entry shows in the trace: the plugin, with `/<reference>` when it is not the name being resolved. */
export function entryLabel(entry: Pick<StackEntry, 'target' | 'name'>, resolving: string): string {
	return entry.target === 'default' || entry.name === resolving ? entry.target : `${entry.target}/${entry.name}`
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

/** Finds the contribution a plugin or `default` holds for a reference. */
export type Lookup = (target: string, name: string) => Contribution | { reason: string }

/** One step with the reference it addresses, which a bare plugin step takes from the file it sits in. */
type Placed = { step: ExtendsStep; name: string; key: string }

/**
 * Expands a list of steps bottom first: each step brings its own `extends` beneath it, recursively.
 * A step is a (plugin, reference) pair; a bare plugin takes the name of the file whose `extends` it
 * sits in, and that name follows the file being read down the walk. Under a written list, bringing in
 * stops silently at a step already in the stack; a cycle makes the name ambiguous in both modes, and a
 * diamond is not a cycle, so a shared base applies once. Only a written step may name another
 * reference; the same step in a plugin's or a default's own `extends` is skipped with a warning.
 */
function expand(
	top: readonly ExtendsStep[],
	owner: string,
	mode: 'written' | 'plugins',
	refName: string,
	lookup: Lookup,
	warn: WarnFn,
) {
	const result: Expansion = { entries: [], missing: [], allMissing: false, replaced: [] }
	const placed = new Set<string>()
	const inProgress = new Set<string>()
	const keyOf = (step: ExtendsStep, inner: string) =>
		step.target === 'default' ? 'default' : `${step.target}/${step.name ?? inner}`
	const nameOf = (step: ExtendsStep, inner: string) => (step.target === 'default' ? refName : (step.name ?? inner))
	const normalize = (
		steps: readonly ExtendsStep[],
		who: string,
		inner: string,
		trusted: boolean,
		self?: string,
	): Placed[] => {
		const out: Placed[] = []
		for (const step of steps) {
			const item: Placed = { step, name: nameOf(step, inner), key: keyOf(step, inner) }
			if (!trusted && item.name !== inner) {
				warn(
					'extends-step-not-allowed',
					`${who} names ${stepLabel(step)} in its extends; only a managed, repo, or user file may pick another reference, so that entry is skipped`,
				)
				continue
			}
			if (item.key === self) {
				warn('extends-self', `${who} lists itself in its extends; that entry is ignored`)
				continue
			}
			if (out.at(-1)?.key === item.key) continue
			if (out.some(({ key }) => key === item.key) && !result.ambiguous) {
				result.ambiguous = { cause: 'repeat', message: `${who}'s extends lists ${stepLabel(step)} at two places` }
			}
			out.push(item)
		}
		return out
	}
	const listed = normalize(top, owner, refName, mode === 'written')
	const listedKeys = new Set(listed.map(({ key }) => key))
	const visit = (item: Placed, isTop: boolean, chain: readonly string[], trusted: boolean) => {
		const { step, name, key } = item
		if (result.ambiguous || placed.has(key)) return
		const shown = name === refName ? step.target : `${step.target}/${name}`
		if (inProgress.has(key)) {
			result.ambiguous = {
				cause: 'cycle',
				message:
					mode === 'plugins'
						? `the plugins' own extends form a cycle: ${[...chain, shown].join(' → ')}`
						: `${owner}'s extends forms a cycle: ${[...chain, shown].join(' → ')}`,
			}
			return
		}
		if (!isTop && listedKeys.has(key)) return
		const found = lookup(step.target, name)
		if ('reason' in found) {
			result.missing.push({ target: step.target, reason: found.reason })
			if (step.target !== 'default') {
				warn(
					name === refName ? 'extends-step-missing' : 'extends-reference-missing',
					`the step ${shown} in ${chain.at(-1) ?? owner}'s extends ${found.reason}; it is skipped`,
				)
			}
			return
		}
		inProgress.add(key)
		const own = found.steps ?? []
		if (step.extends) {
			const kept = new Set(step.extends.map(({ target }) => target))
			for (const { target } of own) if (!kept.has(target)) result.replaced.push({ target, step: step.target })
		}
		const nested = step.extends !== undefined
		for (const sub of normalize(step.extends ?? own, `plugin ${shown}`, name, trusted && nested, key)) {
			visit(sub, false, [...chain, shown], trusted && nested)
		}
		inProgress.delete(key)
		const operation = step.merge ?? found.merge ?? 'patch'
		const from: OperationSource = step.merge ? 'step' : found.merge ? 'contribution' : 'default'
		const entry: StackEntry = { target: step.target, name, contribution: found, operation, from }
		if (step.sections) entry.sections = step.sections
		result.entries.push(entry)
		placed.add(key)
	}
	for (const item of listed) visit(item, true, [], mode === 'written')
	result.allMissing =
		listed.length > 0 &&
		listed.every(({ key }) => !placed.has(key)) &&
		listed.some(({ step }) => step.target !== 'default')
	return result
}

export type Plan = {
	entries: StackEntry[]
	builtBy: string
	/** Plugins a step's own `extends` would have brought in, and the step that replaced it. */
	replaced: { target: string; step: string }[]
	/** Who replaced a step's own `extends`, for the trace. */
	replacedBy: string
	/** The managed, `repo`, or `user` contribution whose written `extends` built the stack. */
	builder?: Contribution
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
			const lower = expand(contribution.steps, contribution.label, 'written', ref.name, lookup, noWarn)
			if (lower.entries.map((entry) => entryLabel(entry, ref.name)).join(' ') !== built.targets) {
				contribution.entry.extendsOutcome = `not used (${built.builder.label}'s extends builds the stack)`
				warn(
					'extends-not-used',
					`${contribution.label} builds a different stack from ${built.builder.label}, whose extends is used`,
				)
			}
			continue
		}
		const expansion = expand(contribution.steps, contribution.label, 'written', ref.name, lookup, warn)
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
			targets: expansion.entries.map((entry) => entryLabel(entry, ref.name)).join(' '),
		}
	}
	if (built) return built
	if (ref.plugin !== undefined) {
		const found = lookup(ref.plugin, ref.name)
		if ('reason' in found) return { status: 'missing', message: `the plugin ${ref.plugin} ${found.reason}` }
		const expansion = expand([{ target: ref.plugin }], `plugin ${ref.plugin}`, 'plugins', ref.name, lookup, warn)
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
						name,
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
		const closure = expand([{ target: holder }], `plugin ${holder}`, 'plugins', name, lookup, noWarn)
		if (closure.ambiguous) return { status: 'ambiguous', ...closure.ambiguous }
		reach.set(
			holder,
			new Set(
				closure.entries
					.filter((entry) => entry.name === name)
					.map(({ target }) => target)
					.filter((target) => target !== holder),
			),
		)
	}
	const tops = names.filter((holder) => !names.some((other) => other !== holder && reach.get(other)?.has(holder)))
	const unordered = (): Failure => ({
		status: 'ambiguous',
		cause: 'unordered',
		message: `the plugins ${names.join(', ')} hold it, and no extends orders them`,
	})
	if (tops.length !== 1) return unordered()
	const top = tops[0] as string
	const expansion = expand([{ target: top }], `plugin ${top}`, 'plugins', name, lookup, warn)
	if (expansion.ambiguous) return { status: 'ambiguous', ...expansion.ambiguous }
	const placed = new Set(expansion.entries.filter((entry) => entry.name === name).map(({ target }) => target))
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

/**
 * A written `extends`'s `declined` (K35): the plugins a customizer left out of it on purpose. Absent,
 * it declines nothing; a malformed one, or an entry that is not a plugin name, is left out with a warning.
 */
export function readDeclined(value: unknown, warn: WarnFn): string[] {
	if (value === undefined || value === null) return []
	if (!Array.isArray(value)) {
		warn('frontmatter-invalid', '`declined` is not a list; it is read as declining nothing')
		return []
	}
	const plugins = value.filter((entry): entry is string => typeof entry === 'string' && namePattern.test(entry))
	if (plugins.length !== value.length) {
		warn('frontmatter-invalid', 'an entry in `declined` is not a plugin name; it is left out')
	}
	return plugins
}

/** The `--extends` values that write `steps` again, or `undefined` when a step holds keys only `--extends-file` takes. */
export function pickValues(steps: readonly ExtendsStep[]): string[] | undefined {
	if (steps.some((step) => step.extends !== undefined || step.sections !== undefined)) return undefined
	return steps.map((step) => (step.merge ? `${stepLabel(step)}:${step.merge}` : stepLabel(step)))
}

export function namesDefault(steps: readonly ExtendsStep[] | undefined): boolean {
	return (steps ?? []).some((step) => step.target === 'default' || namesDefault(step.extends))
}
