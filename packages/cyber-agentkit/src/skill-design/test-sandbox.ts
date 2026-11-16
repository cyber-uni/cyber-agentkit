import { parse as parseYaml } from 'yaml'
import type { ReferenceLayers } from '../references/reference-layers.js'
import { resolveReference } from '../references/resolve-reference.js'

/** The reference that picks how `skill test` contains each run (#302), a YAML file layered across the tiers. */
export const sandboxReferenceName = 'skill-design.test.sandbox'

/**
 * The sandbox templates. `default` runs the agent's shell commands in the harness's OS sandbox and setup scripts and
 * `script` checks in the script sandbox. `folder-only` runs all of them without a sandbox: only the run's own folder,
 * its empty home and config, the file-tool limits, and the PreToolUse hook hold the run.
 */
export const sandboxTemplates = ['default', 'folder-only'] as const
export type SandboxTemplate = (typeof sandboxTemplates)[number]

/** The tiers that may choose the template. A plugin's or a skill's own contribution may not loosen it. */
const choosingTiers = new Set(['managed', 'repo', 'user'])

export type TestSandbox = {
	template: SandboxTemplate
	/** Where the template came from: `--sandbox`, a tier (`managed`, `repo`, `user`), or `default` when none chose one. */
	from: 'flag' | 'managed' | 'repo' | 'user' | 'default'
	warnings: string[]
}

const isTemplate = (value: unknown): value is SandboxTemplate =>
	typeof value === 'string' && (sandboxTemplates as readonly string[]).includes(value)

/** Reads the template a `skill-design.test.sandbox` YAML document names (`template: <name>`). */
export function parseSandbox(content: string): SandboxTemplate | { problem: string } {
	let value: unknown
	try {
		value = parseYaml(content)
	} catch (error) {
		return { problem: `it is not YAML: ${(error as Error).message.split('\n')[0]}` }
	}
	const template = value && typeof value === 'object' ? (value as Record<string, unknown>)['template'] : undefined
	if (isTemplate(template)) return template
	return { problem: `its template must be ${sandboxTemplates.join(' or ')}, not ${JSON.stringify(template ?? null)}` }
}

/**
 * The sandbox a test runs in: `--sandbox` when given, else the template the managed, repo, or user tier's
 * `skill-design.test.sandbox` names, else `default`. A contribution from any other tier, such as a plugin, is not
 * read, so nothing a skill or a plugin ships can turn the sandbox off. Answers a problem for an unknown `--sandbox`
 * or a tier's document that names no template, rather than run in a sandbox the user did not mean.
 */
export function resolveTestSandbox(
	layers: ReferenceLayers,
	flag: string | undefined,
): TestSandbox | { code: 'unknown-sandbox' | 'sandbox-invalid'; problem: string } {
	if (flag !== undefined) {
		if (isTemplate(flag)) return { template: flag, from: 'flag', warnings: [] }
		return {
			code: 'unknown-sandbox',
			problem: `no sandbox template ${flag}; use ${sandboxTemplates.join(' or ')}`,
		}
	}
	const resolved = resolveReference(sandboxReferenceName, layers)
	const used = resolved.trace.layers.find((layer) => layer.outcome === 'used')
	if (resolved.status !== 'found' || resolved.content === undefined || !used)
		return { template: 'default', from: 'default', warnings: [] }
	if (!choosingTiers.has(used.tier)) {
		const chosen = parseSandbox(resolved.content)
		const warnings =
			used.tier === 'plugin' && chosen !== 'default'
				? [
						`sandbox-not-chosen: ${sandboxReferenceName} from plugin ${used.plugin ?? '?'} is not read; only the managed, repo, and user tiers or --sandbox choose the sandbox, so the test runs in the default one`,
					]
				: []
		return { template: 'default', from: 'default', warnings }
	}
	const template = parseSandbox(resolved.content)
	if (typeof template !== 'string')
		return { code: 'sandbox-invalid', problem: `${sandboxReferenceName} at ${used.path}: ${template.problem}` }
	return { template, from: used.tier as 'managed' | 'repo' | 'user', warnings: [] }
}
