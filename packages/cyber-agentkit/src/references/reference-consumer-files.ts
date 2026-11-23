import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { ReferenceFailure } from './reference-error.js'

/**
 * The text an agent reads, given as files or folders: a skill folder, an `AGENTS.md`, an agent
 * definition, a command file. `advise`, `uses`, and `defaults` read a consumer of references this way,
 * and know nothing of what kind of consumer it is.
 */

export type ConsumerFile = {
	/** The file as reported: the path given, joined with the file's place below it when a folder was given. */
	path: string
	/** The file on disk. */
	absolute: string
}

export type ConsumerPath = {
	/** The path as given. */
	input: string
	absolute: string
	/** The folder whose `references/` holds a bundled default for this text: the folder given, or a file's own folder. */
	base: string
	files: ConsumerFile[]
}

const textFile = /\.(md|mdx|txt|yaml|yml|json|toml)$/i
/** A bundled default copy, which is a reference itself and not text that loads one. */
const defaultCopy = /\.default\.[a-z]+$/i

function walk(dir: string, top: string, input: string): ConsumerFile[] {
	// Each skill folder below `top` is judged on its own: a plugin folder holds skills, and so do its dependencies.
	const isSkill = existsSync(join(dir, 'SKILL.md'))
	const out: ConsumerFile[] = []
	for (const entry of readdirSync(dir).sort()) {
		if (entry === 'node_modules' || entry === '.git') continue
		// A skill's eval fixtures are test data, and its root README is for people: neither is text the agent reads.
		if (isSkill && (entry === 'evals' || entry === 'README.md')) continue
		const absolute = join(dir, entry)
		if (statSync(absolute).isDirectory()) out.push(...walk(absolute, top, input))
		else if (textFile.test(entry) && !defaultCopy.test(entry)) {
			const below = absolute
				.slice(top.length + 1)
				.split(sep)
				.join('/')
			out.push({ path: `${withoutTrailingSlash(input)}/${below}`, absolute })
		}
	}
	return out
}

function withoutTrailingSlash(path: string): string {
	let end = path.length
	while (end > 1 && (path[end - 1] === '/' || path[end - 1] === '\\')) end--
	return path.slice(0, end)
}

/** Each path given, with the text files it holds. A folder is walked for text files, skipping bundled default copies. */
export function consumerPaths(inputs: readonly string[], cwd: string): ConsumerPath[] {
	if (inputs.length === 0) throw new ReferenceFailure('path-missing', 'Give a file or folder to read.')
	return inputs.map((input) => {
		const absolute = resolve(cwd, input)
		if (!existsSync(absolute)) {
			throw new ReferenceFailure('path-not-found', `No file or folder at ${input}.`, { details: { path: absolute } })
		}
		if (statSync(absolute).isDirectory()) {
			return { input, absolute, base: absolute, files: walk(absolute, absolute, input) }
		}
		return { input, absolute, base: dirname(absolute), files: [{ path: input, absolute }] }
	})
}

/** False for a path under `node_modules` or a plugin cache: an installed copy, not its author's to edit. */
export function isEditable(path: string): boolean {
	return !/(^|[\\/])node_modules[\\/]/.test(path) && !/[\\/]plugins[\\/]cache[\\/]/.test(path)
}
