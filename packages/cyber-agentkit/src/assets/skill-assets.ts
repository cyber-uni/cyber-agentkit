import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { insideRepository } from '../references/reference-write.js'
import { skillName } from '../skills/skill-folder.js'

/** A refusal. `usage` marks a wrong invocation (exit 2) rather than a refusal (exit 1). */
export class AssetError extends Error {
	readonly code: string
	readonly usage: boolean
	constructor(code: string, message: string, usage = false) {
		super(message)
		this.code = code
		this.usage = usage
	}
}

export type AssetEntry = { path: string; bytes: number }

/** The skill's `assets/` folder, for a skill folder that holds a `SKILL.md`. */
function assetsDir(skill: string, root: string, write: boolean): string {
	const folder = resolve(skill)
	if (skillName(folder) === undefined) {
		throw new AssetError('folder-invalid', `${folder} holds no SKILL.md, so it is not a skill folder.`)
	}
	if (write && !insideRepository(folder, root)) {
		throw new AssetError(
			'folder-invalid',
			`${folder} is outside the repository, such as an installed copy; write to the skill's source instead.`,
		)
	}
	return join(folder, 'assets')
}

/** An asset path: relative, `/`-separated, with no `..` or empty part. */
function assetFile(dir: string, path: string): string {
	const parts = path.split('/')
	if (
		!path ||
		path.includes('\\') ||
		path.startsWith('/') ||
		parts.some((part) => part === '' || part === '.' || part === '..')
	) {
		throw new AssetError(
			'path-invalid',
			`"${path}" is not an asset path. Use a relative path inside assets/, with "/" separators and no "..".`,
			true,
		)
	}
	return join(dir, ...parts)
}

/** True when the real location of an existing file or its nearest existing parent stays inside the folder. */
function contained(dir: string, file: string): boolean {
	if (!existsSync(dir)) return true
	const base = realpathSync(dir)
	let probe = file
	while (!existsSync(probe)) probe = dirname(probe)
	const real = realpathSync(probe)
	return real === base || real.startsWith(base + sep)
}

function guard(dir: string, file: string, path: string): void {
	if (!contained(dir, file)) {
		throw new AssetError('path-invalid', `"${path}" leaves the assets/ folder through a link.`, true)
	}
}

export function listAssets(skill: string, root: string): AssetEntry[] {
	const dir = assetsDir(skill, root, false)
	const entries: AssetEntry[] = []
	const walk = (folder: string, prefix: string) => {
		let items: import('node:fs').Dirent[]
		try {
			items = readdirSync(folder, { withFileTypes: true })
		} catch {
			return
		}
		for (const item of items) {
			const full = join(folder, item.name)
			const stat = lstatSync(full)
			if (stat.isSymbolicLink()) continue
			if (stat.isDirectory()) walk(full, `${prefix}${item.name}/`)
			else if (stat.isFile()) entries.push({ path: `${prefix}${item.name}`, bytes: stat.size })
		}
	}
	walk(dir, '')
	return entries.sort((a, b) => a.path.localeCompare(b.path))
}

export function showAsset(skill: string, root: string, path: string): string {
	const dir = assetsDir(skill, root, false)
	const file = assetFile(dir, path)
	guard(dir, file, path)
	if (!existsSync(file) || !lstatSync(file).isFile()) {
		throw new AssetError('no-file', `${path} does not exist in assets/.`)
	}
	const bytes = readFileSync(file)
	if (bytes.includes(0)) {
		throw new AssetError(
			'binary',
			`${path} is binary (${bytes.length} bytes); point to it by path instead of showing it.`,
		)
	}
	return bytes.toString('utf8')
}

export function writeAsset(
	mode: 'create' | 'update',
	skill: string,
	root: string,
	path: string,
	content: string,
): string {
	const dir = assetsDir(skill, root, true)
	const file = assetFile(dir, path)
	guard(dir, file, path)
	const exists = existsSync(file)
	if (mode === 'create' && exists) {
		throw new AssetError('exists', `${path} already exists in assets/; use update to replace it.`)
	}
	if (mode === 'update' && !exists) {
		throw new AssetError('no-file', `${path} does not exist in assets/; use create to add it.`)
	}
	mkdirSync(dirname(file), { recursive: true })
	writeFileSync(file, content)
	return file
}

export function deleteAsset(skill: string, root: string, path: string): string {
	const dir = assetsDir(skill, root, true)
	const file = assetFile(dir, path)
	guard(dir, file, path)
	if (!existsSync(file) || !lstatSync(file).isFile()) {
		throw new AssetError('no-file', `${path} does not exist in assets/.`)
	}
	rmSync(file)
	for (let folder = dirname(file); folder !== dir && folder.startsWith(dir + sep); folder = dirname(folder)) {
		try {
			rmdirSync(folder)
		} catch {
			break
		}
	}
	return file
}
