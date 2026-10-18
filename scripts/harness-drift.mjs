#!/usr/bin/env node
/**
 * Harness drift detector.
 *
 * Two inputs, reported per axis (`skills` or `instructions`):
 *
 * - Primary vendor documentation, per `vendor-baseline.json` (see `vendor-drift.mjs`). Each source
 *   is a docs section for one harness and one axis, carrying the evidence ID and confidence of the
 *   claim it backs.
 * - The `vercel-labs/skills` agent registry, compared against `harness-baseline.json`, against the
 *   harnesses this package supports, and against the skill directories it records. This is
 *   corroboration only: a secondary source, on the skills axis alone.
 *
 * Neither input covers detection variables, managed-policy locations, or plugin storage, so a clean
 * run says nothing about them.
 *
 * Usage:
 *   node scripts/harness-drift.mjs                   # human-readable report
 *   node scripts/harness-drift.mjs --json            # machine-readable report
 *   node scripts/harness-drift.mjs --issue-body      # markdown for a GitHub issue
 *   node scripts/harness-drift.mjs --update-baseline # accept current upstream as reviewed
 *   --upstream-file <path>                           # read upstream from disk instead of fetching
 *   --baseline <path>                                # use another registry baseline file
 *   --vendor-baseline <path>                         # use another vendor baseline file
 *
 * Exits 1 when drift is found, 0 when clean, 2 on a fetch, parse, or extraction failure. A vendor
 * page that no longer reads as it did is a failure, never a clean result.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { acceptVendor, assertVendorBaseline, compareVendor, ExtractionError, readSources } from './vendor-drift.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const defaultBaselinePath = join(here, 'harness-baseline.json')
const defaultVendorBaselinePath = join(here, 'vendor-baseline.json')
const harnessIdPath = join(root, 'packages', 'agent-kit', 'src', 'harness', 'harness-id.ts')
const skillsDirectoriesPath = join(root, 'packages', 'agent-kit', 'src', 'skills', 'skills-directories.ts')

export const UPSTREAM = 'https://raw.githubusercontent.com/vercel-labs/skills/main/src/agents.ts'

/** A registry entry upstream uses for its shared-directory target, not an agent. */
const PSEUDO_AGENTS = new Set(['universal'])

/**
 * Upstream names a harness differently from `HarnessId` only where listed. Upstream's
 * `github-copilot` covers both Copilot CLI and VS Code's agent mode, so both are tracked under it.
 * An ID absent here is looked up under its own name.
 */
export const UPSTREAM_NAMES = { 'copilot-cli': 'github-copilot', 'vscode-copilot': 'github-copilot' }

export class ParseError extends Error {}

/**
 * Reads `skillsDir` and `globalSkillsDir` per agent out of the upstream `agents` object literal.
 *
 * Throws rather than returning a partial map: a parser that silently drops entries would report
 * them as removed, and one that drops a field would report agreement it never checked. The entry
 * count is cross-checked against the closing braces, an independent read of the same literal.
 */
export function parseUpstream(source) {
	const start = source.indexOf('export const agents')
	if (start === -1) throw new ParseError('could not find `export const agents`')
	const end = source.indexOf('\n};', start)
	if (end === -1) throw new ParseError('could not find the end of the `agents` object literal')
	const literal = source.slice(start, end)

	const keys = [...literal.matchAll(/^ {2}'?([A-Za-z0-9_.-]+)'?: \{$/gm)]
	const closings = (literal.match(/^ {2}\},?$/gm) ?? []).length
	if (keys.length === 0) throw new ParseError('parsed zero agents')
	if (keys.length !== closings) throw new ParseError(`found ${keys.length} agent keys but ${closings} entry closings`)

	const agents = {}
	keys.forEach((key, index) => {
		const name = key[1]
		const entry = literal.slice(key.index, keys[index + 1]?.index ?? literal.length)
		const declared = entry.match(/^ {4}name: '([^']+)',$/m)?.[1]
		if (declared !== name) throw new ParseError(`entry \`${name}\` declares name \`${declared ?? '(none)'}\``)
		const skillsDir = entry.match(/^ {4}skillsDir: '([^']+)',$/m)?.[1]
		if (skillsDir === undefined) throw new ParseError(`entry \`${name}\` has no literal skillsDir`)
		const globalSkillsDir = entry.match(/^ {4}globalSkillsDir: (.+),$/m)?.[1]
		if (globalSkillsDir === undefined) throw new ParseError(`entry \`${name}\` has no globalSkillsDir`)
		if (PSEUDO_AGENTS.has(name)) return
		agents[name] = { skillsDir, globalSkillsDir: normalizeGlobal(globalSkillsDir) }
	})
	return agents
}

/**
 * `join(home, '.claude', 'skills')` becomes `{home}/.claude/skills`, keeping the base variable so a
 * move from `home` to `configHome` still shows. Any other expression is kept verbatim.
 */
export function normalizeGlobal(expression) {
	if (expression === 'undefined') return null
	const join = expression.match(/^join\(([A-Za-z_$][\w$]*)((?:,\s*'[^']*')*)\)$/)
	if (!join) return expression
	const segments = [...join[2].matchAll(/'([^']*)'/g)].map((segment) => segment[1])
	return [`{${join[1]}}`, ...segments].join('/')
}

/** Validates the harness IDs this package supports, whatever shape they were read from. */
export function assertHarnessIds(ids) {
	if (!Array.isArray(ids)) throw new ParseError('`harnessIds` is not an array')
	if (ids.length === 0) throw new ParseError('`harnessIds` is empty')
	const bad = ids.filter((id) => typeof id !== 'string' || id.length === 0)
	if (bad.length) throw new ParseError(`\`harnessIds\` holds non-string entries: ${JSON.stringify(bad)}`)
	return ids
}

/**
 * Imports the roster from source rather than parsing it, so new harnesses land here with no change
 * to this script. The package holds no skills directories, so the roster is all it compares.
 */
export async function loadHarnessIds(path = harnessIdPath) {
	let module
	try {
		module = await import(pathToFileURL(path).href)
	} catch (error) {
		throw new ParseError(`could not import ${path}: ${error.message}`)
	}
	return assertHarnessIds(module.harnessIds)
}

/**
 * Imports `skillsDirectories` from source, like the roster. A harness it returns `undefined` for is
 * left out, so the directory checks skip it.
 */
export async function loadSkillsDirectories(harnessIds, path = skillsDirectoriesPath) {
	let module
	try {
		module = await import(pathToFileURL(path).href)
	} catch (error) {
		throw new ParseError(`could not import ${path}: ${error.message}`)
	}
	if (typeof module.skillsDirectories !== 'function') throw new ParseError('`skillsDirectories` is not a function')
	const directories = {}
	for (const id of harnessIds) {
		const recorded = module.skillsDirectories(id)
		if (recorded !== undefined) directories[id] = recorded
	}
	return directories
}

export function upstreamName(id) {
	return UPSTREAM_NAMES[id] ?? id
}

/**
 * Upstream records one directory per scope; a harness may read several. So a directory upstream
 * names that the recorded list lacks is a finding, and a recorded directory upstream omits is not.
 * Only a global directory under `{home}` is compared: the other bases (`{configHome}`,
 * `{claudeHome}`, `{codexHome}`) move with environment variables.
 */
function directoryFindings(agent, harness, dirs, recorded) {
	const findings = []
	if (!recorded.project.includes(dirs.skillsDir))
		findings.push({
			kind: 'project-dir-unrecorded',
			agent,
			harness,
			detail: `Upstream reads \`${dirs.skillsDir}\`, but the recorded project directories are ${list(recorded.project)}. Check \`${recorded.research.join('`, `')}\` against the vendor.`,
		})
	const home = dirs.globalSkillsDir?.match(/^\{home\}\/(.+)$/)?.[1]
	if (home !== undefined && !recorded.user.includes(home))
		findings.push({
			kind: 'global-dir-unrecorded',
			agent,
			harness,
			detail: `Upstream reads \`~/${home}\`, but the recorded user directories are ${list(recorded.user)}. Check \`${recorded.research.join('`, `')}\` against the vendor.`,
		})
	return findings
}

function list(directories) {
	return directories.map((directory) => `\`${directory}\``).join(', ')
}

export function compare({ upstream, baseline, harnessIds, directories = {} }) {
	const findings = []
	// One upstream agent can stand for more than one harness here.
	const supported = new Map()
	for (const id of harnessIds) supported.set(upstreamName(id), [...(supported.get(upstreamName(id)) ?? []), id])

	for (const [agent, dirs] of Object.entries(upstream)) {
		const previous = baseline.agents[agent]
		if (previous === undefined) {
			findings.push({
				kind: 'new-agent',
				agent,
				detail: `New upstream agent with skillsDir \`${dirs.skillsDir}\`. A support candidate.`,
			})
			continue
		}
		for (const harness of supported.get(agent) ?? []) {
			if (previous.skillsDir !== dirs.skillsDir)
				findings.push({
					kind: 'project-dir-changed',
					agent,
					harness,
					detail: `skillsDir changed from \`${previous.skillsDir}\` to \`${dirs.skillsDir}\`.`,
				})
			if (previous.globalSkillsDir !== dirs.globalSkillsDir)
				findings.push({
					kind: 'global-dir-changed',
					agent,
					harness,
					detail: `globalSkillsDir changed from \`${previous.globalSkillsDir}\` to \`${dirs.globalSkillsDir}\`.`,
				})
		}
	}

	for (const agent of Object.keys(baseline.agents)) {
		if (upstream[agent] === undefined)
			findings.push({ kind: 'agent-removed', agent, detail: 'Present in baseline, absent upstream.' })
	}

	for (const [agent, harnesses] of supported) {
		if (upstream[agent] === undefined) continue
		for (const harness of harnesses)
			if (directories[harness])
				findings.push(...directoryFindings(agent, harness, upstream[agent], directories[harness]))
	}

	for (const [agent, harnesses] of supported) {
		if (upstream[agent] !== undefined) continue
		for (const harness of harnesses)
			findings.push({
				kind: 'supported-absent-upstream',
				agent,
				harness,
				detail: `\`${harness}\` is supported here but upstream has no \`${agent}\` entry. Check whether it was renamed, or add it to \`UPSTREAM_NAMES\`.`,
			})
	}

	return findings.map((finding) => ({ source: 'registry', axis: 'skills', ...finding }))
}

const TITLES = {
	'vendor-path-added': 'Vendor docs name a new path',
	'vendor-path-removed': 'Vendor docs no longer name a path',
	'vendor-section-changed': 'Vendor docs section changed',
	'recorded-dir-undocumented': 'Recorded skills directory no longer in the vendor docs',
	'new-agent': 'New agents upstream',
	'agent-removed': 'Agents removed upstream',
	'project-dir-changed': 'Project skills directory changed for a supported harness',
	'global-dir-changed': 'Global skills directory changed for a supported harness',
	'supported-absent-upstream': 'Supported harness missing upstream',
	'project-dir-unrecorded': 'Upstream project skills directory not recorded here',
	'global-dir-unrecorded': 'Upstream global skills directory not recorded here',
}

const AXIS_TITLES = { skills: 'Skills axis', instructions: 'Instructions axis' }

function findingLine(finding) {
	if (finding.source === 'vendor') {
		const weak = finding.confidence.startsWith('High')
			? ''
			: ` The claim was already only ${finding.confidence.split(' ')[0]} confidence.`
		return `- **${finding.harness}**: ${finding.detail} Backs \`${finding.evidence}\` (${finding.confidence.split(' ')[0]}), from <${finding.url}>.${weak}`
	}
	return `- **${finding.agent}**${finding.harness ? ` (\`${finding.harness}\`)` : ''}: ${finding.detail}`
}

function groupBy(items, key) {
	return items.reduce((acc, item) => {
		;(acc[key(item)] ??= []).push(item)
		return acc
	}, {})
}

export function issueBody({ findings, total, harnessIds, sources }) {
	const byAxis = groupBy(findings, (finding) => finding.axis)
	return [
		'The harness drift check found changes against the reviewed baselines.',
		'',
		`It read **${sources}** vendor documentation sections for the **${harnessIds.length}** supported harnesses (${harnessIds.map((id) => `\`${id}\``).join(', ')}), and, as corroboration, the [\`vercel-labs/skills\`](${UPSTREAM}) registry of **${total}** agents.`,
		'',
		...['skills', 'instructions'].flatMap((axis) => {
			const items = byAxis[axis] ?? []
			if (items.length === 0) return [`## ${AXIS_TITLES[axis]}`, '', 'No change.', '']
			const vendor = items.filter((item) => item.source === 'vendor')
			const registry = items.filter((item) => item.source === 'registry')
			return [
				`## ${AXIS_TITLES[axis]}`,
				'',
				...Object.entries(groupBy(vendor, (item) => item.kind)).flatMap(([kind, group]) => [
					`### ${TITLES[kind] ?? kind}`,
					'',
					...group.map(findingLine),
					'',
				]),
				...(registry.length
					? [
							'### Corroboration: `vercel-labs/skills` registry',
							'',
							'A secondary source. It records one directory per scope and calls an agent universal when its',
							'project directory is `.agents/skills`, so a mismatch is a prompt to research, not a verdict.',
							'',
							...Object.entries(groupBy(registry, (item) => item.kind)).flatMap(([kind, group]) => [
								`#### ${TITLES[kind] ?? kind}`,
								'',
								...group.map(findingLine),
								'',
							]),
						]
					: []),
			]
		}),
		'## What this does and does not tell you',
		'',
		'The vendor sources cover skills directories and instruction files, and nothing else. Neither',
		'input covers detection variables, managed-policy locations, or plugin storage, so a clean run',
		'does not mean those facts are current.',
		'',
		'## Next',
		'',
		'This check proposes; it does not decide. Close each finding through the research loop (the',
		'`harness-update` skill in repobuddy/buddy-agent-harness): verify it against the vendor, record',
		'the outcome in `.research/harness-detection/`, update `skillsDirectories()` or the instruction',
		'evidence it backs, then accept the new state with `node scripts/harness-drift.mjs --update-baseline`.',
		'The baseline does not clear a directory finding (`recorded-dir-undocumented`,',
		'`*-dir-unrecorded`): those clear only when `skillsDirectories()` agrees with the source.',
		'',
	].join('\n')
}

function option(args, name) {
	const index = args.indexOf(name)
	return index === -1 ? undefined : args[index + 1]
}

async function readUpstream(args) {
	const file = option(args, '--upstream-file')
	if (file) return readFileSync(resolve(file), 'utf8')
	return fetchText(UPSTREAM)
}

function fail(message) {
	process.stderr.write(`error: ${message}\n`)
	process.exit(2)
}

async function fetchText(url) {
	if (url.startsWith('file:')) return readFileSync(fileURLToPath(url), 'utf8')
	const response = await fetch(url)
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return response.text()
}

async function main() {
	const args = process.argv.slice(2)
	const baselinePath = resolve(option(args, '--baseline') ?? defaultBaselinePath)
	const vendorBaselinePath = resolve(option(args, '--vendor-baseline') ?? defaultVendorBaselinePath)

	let source
	try {
		source = await readUpstream(args)
	} catch (error) {
		fail(`could not fetch upstream registry: ${error.message}`)
	}

	let upstream
	let harnessIds
	let directories
	let vendorBaseline
	let readings
	try {
		upstream = parseUpstream(source)
		harnessIds = await loadHarnessIds()
		directories = await loadSkillsDirectories(harnessIds)
		vendorBaseline = assertVendorBaseline(JSON.parse(readFileSync(vendorBaselinePath, 'utf8')))
		readings = await readSources(vendorBaseline, fetchText)
	} catch (error) {
		if (error instanceof ParseError) fail(`${error.message}; the source layout probably changed.`)
		if (error instanceof ExtractionError) fail(`${error.message}; the vendor page probably changed its layout.`)
		throw error
	}

	if (args.includes('--update-baseline')) {
		const reviewed = new Date().toISOString().slice(0, 10)
		const next = { source: UPSTREAM, reviewed, agents: upstream }
		writeFileSync(baselinePath, `${JSON.stringify(next, null, '\t')}\n`)
		writeFileSync(
			vendorBaselinePath,
			`${JSON.stringify(acceptVendor(vendorBaseline, readings, reviewed), null, '\t')}\n`,
		)
		process.stdout.write(
			`Baselines updated: ${Object.keys(upstream).length} agents, ${vendorBaseline.sources.length} vendor sources.\n`,
		)
		return
	}

	const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
	const findings = [
		...compareVendor({ baseline: vendorBaseline, readings, directories }),
		...compare({ upstream, baseline, harnessIds, directories }),
	]
	const total = Object.keys(upstream).length
	const sources = vendorBaseline.sources.length

	if (args.includes('--json')) {
		process.stdout.write(`${JSON.stringify({ agents: total, sources, supported: harnessIds, findings }, null, 2)}\n`)
	} else if (args.includes('--issue-body')) {
		process.stdout.write(issueBody({ findings, total, harnessIds, sources }))
	} else {
		process.stdout.write(
			findings.length
				? `${findings.length} finding(s):\n${findings.map((f) => `- [${f.axis}/${f.source}/${f.kind}] ${f.harness ?? f.agent}: ${f.detail}`).join('\n')}\n`
				: `No drift. ${sources} vendor sources, ${total} upstream agents; supported harnesses: ${harnessIds.join(', ')}.\n`,
		)
	}

	process.exit(findings.length ? 1 : 0)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
