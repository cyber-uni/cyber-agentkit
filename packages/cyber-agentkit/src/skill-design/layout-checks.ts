import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import type { CheckOutcome } from './skill-check-types.js'
import { readText, type SkillFiles } from './skill-files.js'
import { isExternal, leavesFolder, linkTargets, plainPaths, resolveIn } from './skill-text.js'

/**
 * The folders a skill may hold. `scripts/`, `references/`, and `assets/` are the Agent Skills
 * specification's (https://agentskills.io/specification); `evals/` holds the suite the Verification
 * aspect reads; `agents/` holds a harness's interface metadata, such as Codex's `agents/openai.yaml`
 * (E-PA-5, low confidence), so it may hold YAML only.
 */
const allowedFolders = new Set(['scripts', 'references', 'assets', 'evals', 'agents'])

/** Repository folders a shipped skill has no copy of once installed. */
const repositoryFolders = ['docs/', 'src/', 'apps/', 'packages/']

/** Files a skill's root keeps out of `assets/`: images, data, and templates. */
const staticResource = /\.(png|jpe?g|gif|svg|ico|webp|json|ya?ml|toml|csv|xml)$|\.template\.|\.tmpl$|^template\./i

/** The nearest folder above `folder` that holds `.git`, or `undefined` outside a repository. */
function repositoryRoot(folder: string): string | undefined {
	for (let at = dirname(folder); ; at = dirname(at)) {
		if (existsSync(join(at, '.git'))) return at
		if (dirname(at) === at) return undefined
	}
}

function outcome(id: string, problems: { file: string; message: string }[]): CheckOutcome {
	return problems.length
		? { id, status: 'fail', message: problems.map((item) => item.message).join('; '), file: problems[0]?.file }
		: { id, status: 'pass' }
}

/** SHP-7: the skill folder sits directly under a skill root, a folder named `skills`. */
function checkRoot(skill: SkillFiles): CheckOutcome {
	const root = basename(dirname(skill.folder))
	return root === 'skills'
		? { id: 'SHP-7', status: 'pass' }
		: {
				id: 'SHP-7',
				status: 'fail',
				message: `the skill folder sits in "${root}", not directly in a skills folder`,
				file: 'SKILL.md',
			}
}

/** Whether the skill ships to others: its `skills` root is not inside a dot-folder such as `.agents/` or `.claude/`. */
function ships(skill: SkillFiles): boolean {
	const root = dirname(skill.folder)
	return basename(root) === 'skills' && !basename(dirname(root)).startsWith('.')
}

/** SHP-8: a skill that ships links and names no file outside its folder. */
function checkContained(skill: SkillFiles): CheckOutcome {
	if (!ships(skill)) return { id: 'SHP-8', status: 'pass' }
	const repository = repositoryRoot(skill.folder)
	const problems: { file: string; message: string }[] = []
	const texts = skill.files.filter(
		(file) => file === 'SKILL.md' || (file.startsWith('references/') && file.endsWith('.md')),
	)
	for (const file of texts) {
		const text = file === 'SKILL.md' ? skill.body : readText(skill, file)
		if (text === undefined) continue
		const from = dirname(file)
		const outside = new Set<string>()
		for (const written of linkTargets(text)) {
			const path = written.split('#')[0] as string
			if (path && !isExternal(path) && leavesFolder(resolveIn(from, decodeURI(path)))) outside.add(path)
		}
		for (const path of plainPaths(text)) {
			if (path.startsWith('../') && leavesFolder(resolveIn(from, path))) outside.add(path)
			else if (repository && repositoryFolders.some((prefix) => path.startsWith(prefix))) {
				const inRepository = join(repository, path)
				if (existsSync(inRepository) && leavesFolder(relative(skill.folder, inRepository).split('\\').join('/')))
					outside.add(path)
			}
		}
		for (const path of outside) problems.push({ file, message: `${file} points to ${path}, outside the skill folder` })
	}
	return outcome('SHP-8', problems)
}

/** SHP-9: `skill.json`, when present, is an object with a `distribution.install_via` it knows. */
function checkManifest(skill: SkillFiles): CheckOutcome {
	if (!skill.files.includes('skill.json')) return { id: 'SHP-9', status: 'pass' }
	const fail = (message: string): CheckOutcome => ({ id: 'SHP-9', status: 'fail', message, file: 'skill.json' })
	let manifest: unknown
	try {
		manifest = JSON.parse(readFileSync(join(skill.folder, 'skill.json'), 'utf8'))
	} catch {
		return fail('skill.json is not valid JSON')
	}
	if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return fail('skill.json is not an object')
	const distribution = (manifest as Record<string, unknown>)['distribution']
	if (distribution === undefined) return { id: 'SHP-9', status: 'pass' }
	if (!distribution || typeof distribution !== 'object') return fail('skill.json `distribution` is not an object')
	const { install_via, package: pkg } = distribution as Record<string, unknown>
	if (install_via !== 'package_manager')
		return fail(
			`skill.json \`distribution.install_via\` is ${JSON.stringify(install_via) ?? 'missing'}, not "package_manager"`,
		)
	const name = pkg && typeof pkg === 'object' ? (pkg as Record<string, unknown>)['name'] : undefined
	if (typeof name !== 'string' || !name.trim())
		return fail('skill.json has no `distribution.package.name`, which `package_manager` needs')
	return { id: 'SHP-9', status: 'pass' }
}

/** SHP-10: only the standard folders, and `agents/` holds YAML only. */
function checkFolders(skill: SkillFiles): CheckOutcome {
	const problems: { file: string; message: string }[] = []
	const folders = new Set(skill.files.filter((file) => file.includes('/')).map((file) => file.split('/')[0] as string))
	for (const folder of [...folders].sort())
		if (!folder.startsWith('.') && !allowedFolders.has(folder))
			problems.push({ file: `${folder}/`, message: `${folder}/ is not a standard skill folder` })
	for (const file of skill.files)
		if (file.startsWith('agents/') && !/\.ya?ml$/i.test(file) && !basename(file).startsWith('.'))
			problems.push({ file, message: `${file} is in agents/, which holds YAML only` })
	return outcome('SHP-10', problems)
}

/** SHP-11: static resources are in `assets/`, and the root holds no Markdown but `SKILL.md` and `README.md`. */
function checkRootFiles(skill: SkillFiles): CheckOutcome {
	const problems: { file: string; message: string }[] = []
	for (const file of skill.files) {
		if (file.includes('/') || file === 'skill.json') continue
		if (staticResource.test(file)) problems.push({ file, message: `${file} is a static resource; move it to assets/` })
		else if (extname(file).toLowerCase() === '.md' && !/^(skill|readme)\.md$/i.test(file))
			problems.push({ file, message: `${file} is extra documentation; move it to references/` })
	}
	return outcome('SHP-11', problems)
}

/** SHP-7 to SHP-11, the Shape checks a script decides from the skill's folder layout. */
export function checkLayout(skill: SkillFiles): CheckOutcome[] {
	return [checkRoot(skill), checkContained(skill), checkManifest(skill), checkFolders(skill), checkRootFiles(skill)]
}
