import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { LoadReferenceOptions } from './load-reference.js'
import { findRoot, type ReferenceLayers, referenceLayers } from './reference-layers.js'
import {
	type CreateArgs,
	type CreateResult,
	createContribution,
	type DeleteResult,
	deleteContribution,
} from './reference-write.js'
import { validateWrite, type WriteCommand } from './reference-write-checks.js'

/** Where a write goes; a folder is relative to `cwd`. Pass at most one of `scope`, `in`, `plugin`, and `default`. */
type PlaceOptions = {
	/** `repo` (default) or `user`. */
	scope?: string | undefined
	/** A folder strictly below the root, which must exist and not be git-ignored: its project section. */
	in?: string | undefined
	/** A plugin's source folder in the repository: its `references/<name>.md`. */
	plugin?: string | undefined
	/** A skill's source folder in the repository: its `references/<name>.default.md`. It also joins as the `default` tier. */
	default?: string | undefined
	/** Report what would be written or deleted, and change nothing. */
	dryRun?: boolean | undefined
}

export type CreateReferenceOptions = LoadReferenceOptions &
	PlaceOptions & {
		/** `replace`, `patch` (default in the `repo` and `user` tiers), `combine`, or `remove`. */
		merge?: string | undefined
		/** A file whose text is written as it is, frontmatter included. */
		template?: string | undefined
		/** An interface id: its sections are written as `##` headings, each stubbed `**Unsupported.**`. */
		implements?: string | undefined
	}

export type DeleteReferenceOptions = LoadReferenceOptions & PlaceOptions

async function prepare(
	command: WriteCommand,
	name: string,
	options: CreateReferenceOptions,
): Promise<{ layers: ReferenceLayers; args: CreateArgs }> {
	const cwd = options.cwd ?? process.cwd()
	const home = options.home ?? homedir()
	const at = (folder: string | undefined) => (folder === undefined ? undefined : resolve(cwd, folder))
	const args: CreateArgs = {
		root: options.root === undefined ? findRoot(cwd) : resolve(cwd, options.root),
		home,
		name,
		scope: options.scope,
		in: at(options.in),
		plugin: at(options.plugin),
		default: at(options.default),
		merge: options.merge,
		template: at(options.template),
		implements: options.implements,
		dryRun: options.dryRun,
	}
	// A usage error comes before anything is read, `root-missing` included (C3).
	validateWrite({ command, ...args })
	const layers = await referenceLayers({
		...options,
		cwd,
		home,
		platform: options.platform ?? process.platform,
		defaultSkill: args.default ?? options.defaultSkill,
	})
	return { layers, args: { ...args, root: layers.root ?? args.root } }
}

/**
 * Starts a contribution the way `reference create` does and returns its record: the path, the
 * content, its warnings (such as `reference-hidden` for a file a contribution above hides, which is
 * written all the same), and the name resolved after the write. A refused write throws
 * `ReferenceError` with its code, marked `usage` for a wrong call.
 */
export async function createReference(name: string, options: CreateReferenceOptions): Promise<CreateResult> {
	const { layers, args } = await prepare('create', name, options)
	return createContribution(layers, args)
}

/**
 * Deletes the file answering a name at one place the way `reference delete` does, with a non-Markdown
 * file's metadata file, and returns what answers the name afterwards. With no file there it is a
 * no-op whose record carries the `no-file` code. A refused delete throws `ReferenceError`.
 */
export async function deleteReference(name: string, options: DeleteReferenceOptions): Promise<DeleteResult> {
	const { layers, args } = await prepare('delete', name, options)
	return deleteContribution(layers, args)
}
