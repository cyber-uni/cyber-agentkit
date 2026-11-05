import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { harnessSkillFolders } from '../skills/harness-skill-folders.js'
import { type FoundSkill, skillsIn } from '../skills/skill-folder.js'
import { escapeRegExp, providerTerms, providerTermsExact, toolNames } from './reference-audit-patterns.js'
import { ReferenceFailure } from './reference-error.js'
import type { ReferenceLayers } from './reference-layers.js'
import { resolveReference } from './resolve-reference.js'
import { withDefault } from './skill-defaults.js'

export type AuditCategory = 'provider' | 'workflow' | 'tool' | 'format' | 'policy' | 'environment'

/** Text that looks hard-coded. A lead is a candidate to judge, never a verdict. */
export type AuditLead = {
	file: string
	line: number
	category: AuditCategory
	kind: 'host' | 'term' | 'command' | 'path' | 'url' | 'steps' | 'block'
	match: string
	/** The line the lead was found on. */
	text: string
	/** For a run of lines (`steps`, `block`): how many. */
	lines?: number
	status: 'candidate'
}

export type AuditLoad = {
	name: string
	default: boolean
	status: string
	/** The tiers whose contribution is used, bottom first. */
	answeredBy: string[]
	/** True when nothing but the skill's own default answers: shipping it changes nothing. */
	defaultAnswers: boolean
}

export type SkillAudit = {
	skill: FoundSkill
	/** False for a copy installed under `node_modules` or a plugin cache: not the author's to edit. */
	editable: boolean
	files: { path: string; bytes: number }[]
	leads: AuditLead[]
	loads?: AuditLoad[]
	interfaces?: string[]
	/** The names loaded with no default of the skill's own. */
	gaps?: string[]
}

export type AuditOptions = {
	/** A skill folder, else a skill name. */
	skill: string
	cwd: string
	also?: readonly string[] | undefined
	display?: ((path: string) => string) | undefined
}

const textFile = /\.(md|mdx|txt|yaml|yml|json|toml)$/i
const defaultFile = /(^|\/)references\/[^/]+\.default\.[a-z]+$/
const dataFormats = ['md', 'json', 'yaml', 'yml', 'toml', 'txt']

function walk(dir: string, top = dir): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir).sort()) {
		if (entry === 'node_modules' || entry === '.git') continue
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) out.push(...walk(path, top))
		else out.push(relative(top, path).split(sep).join('/'))
	}
	return out
}

/** The skill given as a folder, else by name among the folders the detected harnesses read and the repository's own. */
export function findSkill(input: string, layers: ReferenceLayers, cwd: string, home = homedir()): FoundSkill {
	const folder = resolve(cwd, input)
	const own = skillsIn([folder])
	if (own.length === 1 && existsSync(join(folder, 'SKILL.md'))) return own[0] as FoundSkill
	const root = layers.root ?? cwd
	const folders = layers.harnesses.flatMap(
		(harness) =>
			harnessSkillFolders(harness, { chain: [root], home, platform: process.platform, env: process.env }) ?? [],
	)
	const known = skillsIn([
		...folders,
		join(root, 'skills'),
		...(layers.skills?.skills.map((skill) => skill.folder) ?? []),
	])
	const same = known.filter(({ name }) => name === input)
	if (same.length === 1) return same[0] as FoundSkill
	if (same.length) {
		throw new ReferenceFailure(
			'skill-ambiguous',
			`${same.length} skills are named "${input}"; give the folder of one.`,
			{
				details: { folders: same.map((skill) => skill.folder) },
			},
		)
	}
	throw new ReferenceFailure('skill-not-found', `No skill "${input}" was found; give its name or its folder.`, {})
}

/** Where the body starts: the line after the frontmatter, which carries the trigger and stays in the skill. */
function bodyStart(lines: string[]): number {
	if (lines[0]?.trim() !== '---') return 0
	const end = lines.findIndex((line, at) => at > 0 && line.trim() === '---')
	return end < 0 ? 0 : end + 1
}

export function leadsIn(file: string, text: string, also: readonly string[] = []): AuditLead[] {
	const lines = text.split('\n')
	const start = bodyStart(lines)
	const leads: AuditLead[] = []
	const add = (line: number, category: AuditCategory, kind: AuditLead['kind'], match: string, extra: object = {}) =>
		leads.push({
			file,
			line,
			category,
			kind,
			match,
			text: (lines[line - 1] ?? '').trim(),
			...extra,
			status: 'candidate',
		})
	const patterns: [RegExp, AuditCategory, AuditLead['kind']][] = [
		[new RegExp(`\\b(?:${providerTerms.map(escapeRegExp).join('|')})\\b`, 'gi'), 'provider', 'host'],
		[new RegExp(`\\b(?:${providerTermsExact.map(escapeRegExp).join('|')})\\b`, 'g'), 'provider', 'host'],
		[
			new RegExp(`(?<![\\w./~-])(?:${toolNames.map(escapeRegExp).join('|')})(?![\\w/-])(?: [a-z][\\w-]*){0,2}`, 'g'),
			'tool',
			'command',
		],
		[/(?<![\w/])(?:~|\/(?:home|Users|etc|var|usr|opt|tmp))\/[^\s`'")]*/g, 'environment', 'path'],
		[/https?:\/\/[^\s`'")>]*[^\s`'")>.,;]/g, 'environment', 'url'],
		...(also.length
			? ([[new RegExp(`\\b(?:${also.map(escapeRegExp).join('|')})\\b`, 'g'), 'provider', 'term']] as [
					RegExp,
					AuditCategory,
					AuditLead['kind'],
				][])
			: []),
	]
	for (let index = start; index < lines.length; index++) {
		const line = lines[index] as string
		for (const [pattern, category, kind] of patterns) {
			for (const found of line.matchAll(pattern)) add(index + 1, category, kind, found[0].trim())
		}
	}
	// A run of two or more list items is a step list; a fenced block of two or more lines may be a template.
	const item = /^\s*(?:\d+[.)]|[-*])\s+/
	for (let index = start; index < lines.length; ) {
		const line = lines[index] as string
		if (/^\s*```/.test(line)) {
			const close = lines.findIndex((next, at) => at > index && /^\s*```/.test(next))
			const end = close < 0 ? lines.length : close
			if (end - index - 1 >= 2) add(index + 1, 'format', 'block', line.trim(), { lines: end - index - 1 })
			index = end + 1
		} else if (item.test(line)) {
			let end = index
			while (end + 1 < lines.length && item.test(lines[end + 1] as string)) end++
			if (end > index) add(index + 1, 'workflow', 'steps', line.trim(), { lines: end - index + 1 })
			index = end + 1
		} else index++
	}
	return leads.sort((a, b) => a.line - b.line)
}

/** The reference names a skill's text loads with the `reference` skill, and the interfaces whose implementations it loads. */
export function loadsIn(text: string): { names: string[]; interfaces: string[] } {
	const names: string[] = []
	const interfaces: string[] = []
	for (const found of text.matchAll(/Load\s+([^.]*?)\s+with\s+the\s+`reference`\s+skill/g)) {
		const clause = found[1] as string
		const iface = /implementations\s+of\s+the\s+`([^`]+)`\s+interface/.exec(clause)
		if (iface) interfaces.push(iface[1] as string)
		else for (const name of clause.matchAll(/`([^`]+)`/g)) names.push(name[1] as string)
	}
	return { names, interfaces }
}

function holdsDefault(folder: string, name: string): boolean {
	return dataFormats.some((format) => existsSync(join(folder, 'references', `${name}.default.${format}`)))
}

export function auditSkill(layers: ReferenceLayers, { skill: input, cwd, also }: AuditOptions): SkillAudit {
	const skill = findSkill(input, layers, cwd)
	const files = walk(skill.folder)
	const names = new Set<string>()
	const interfaces = new Set<string>()
	const leads: AuditLead[] = []
	for (const path of files) {
		if (!textFile.test(path) || defaultFile.test(path)) continue
		const text = readFileSync(join(skill.folder, path), 'utf8')
		leads.push(...leadsIn(path, text, also))
		const loaded = loadsIn(text)
		for (const name of loaded.names) names.add(name)
		for (const id of loaded.interfaces) interfaces.add(id)
	}
	const loadLayers = withDefault(layers, skill.folder)
	const loads = [...names].map((name): AuditLoad => {
		const resolved = resolveReference(name, loadLayers)
		const answeredBy = resolved.trace.layers
			.filter(({ outcome }) => outcome === 'used')
			.map((layer) => (layer.tier === 'plugin' && layer.plugin ? `plugin ${layer.plugin}` : layer.tier))
		const hasDefault = holdsDefault(skill.folder, name)
		return {
			name,
			default: hasDefault,
			status: resolved.status,
			answeredBy,
			defaultAnswers: hasDefault && answeredBy.length === 1 && answeredBy[0] === 'default',
		}
	})
	const editable = !/(^|[\\/])node_modules[\\/]/.test(skill.folder) && !/[\\/]plugins[\\/]cache[\\/]/.test(skill.folder)
	return {
		skill,
		editable,
		files: files.map((path) => ({ path, bytes: statSync(join(skill.folder, path)).size })),
		leads,
		...(loads.length ? { loads } : {}),
		...(interfaces.size ? { interfaces: [...interfaces] } : {}),
		...(loads.some((load) => !load.default)
			? { gaps: loads.filter((load) => !load.default).map((load) => load.name) }
			: {}),
	}
}
