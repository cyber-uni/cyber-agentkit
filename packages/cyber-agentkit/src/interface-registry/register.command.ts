import { readFileSync } from 'node:fs'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { CliError, isCliError, result } from 'clibuilder/axi'
import { gh } from './github-cli.js'
import { type InterfaceEntry, interfaceEntryText, interfaceIdPattern, parseInterfaceEntry } from './interface-entry.js'
import { lookupInterface, type NearMatch } from './interface-lookup.js'
import {
	defaultRoute,
	newIssueUrl,
	RecordFailure,
	type RecordRoute,
	recordAsIssue,
	recordAsPullRequest,
} from './interface-record.js'
import {
	interfaceEntryUrl,
	interfaceRegistryUrl,
	RegistryUnreachable,
	readInterfaceRegistry,
} from './interface-registry.js'

export type ReferenceRegisterReport = {
	id: string
	/** Whether an issue or pull request was opened. */
	recorded: boolean
	route?: RecordRoute
	/** Why the route was taken: the default's reason, or that an option forced it. */
	why?: string
	/** The issue or pull request opened, or the new-issue page to open when the GitHub tool could not. */
	url?: string
	/** How many registered interfaces the lookup compared. */
	compared: number
	/** The near matches shown, each with why it matched. */
	near?: NearMatch[]
	/** The entry that would be or was recorded, as Markdown. */
	entry?: string
}

type RegisterArgs = {
	id: string
	description: string | undefined
	plugin: string[] | undefined
	tag: string[] | undefined
	status: string | undefined
	interface: string | undefined
	file: string | undefined
	seen: string[] | undefined
	as: string | undefined
	yes: boolean | undefined
}

const routes: Record<string, RecordRoute> = { 'pull-request': 'pull-request', pr: 'pull-request', issue: 'issue' }

function usage(message: string, code: string, help?: string): never {
	throw new CliError(message, { code, exitCode: exitCodes.usage, ...(help ? { help: [help] } : {}) })
}

/** The entry to record: from `--file` when given, with each option given on the command line over it. */
function entryFrom(args: RegisterArgs): InterfaceEntry {
	let entry: InterfaceEntry = { id: args.id }
	if (args.file !== undefined) {
		let text: string
		try {
			text = readFileSync(args.file, 'utf8')
		} catch {
			usage(`Cannot read the entry file \`${args.file}\`.`, 'entry-unreadable')
		}
		const parsed = parseInterfaceEntry(text, args.id)
		if (parsed.problems.length) {
			usage(`The entry file \`${args.file}\` has problems: ${parsed.problems.join('; ')}.`, 'entry-invalid')
		}
		entry = parsed.entry
	}
	const list = (values: string[] | undefined) =>
		values
			?.flatMap((value) => value.split(','))
			.map((value) => value.trim())
			.filter(Boolean)
	if (args.description?.trim()) entry.description = args.description.trim()
	const plugins = list(args.plugin)
	if (plugins?.length) entry.plugins = plugins.map((name) => ({ name }))
	const tags = list(args.tag)
	if (tags?.length) entry.tags = tags
	if (args.status?.trim()) entry.status = args.status.trim()
	if (args.interface?.trim()) entry.interface = args.interface.trim()
	return entry
}

export function registerCommand(path: string): cli.Command {
	return command({
		name: 'register',
		description:
			'Record a reference interface in the public registry so others can find it: look the id up first, stop on the same id or show near matches, then open a pull request or an issue only when confirmed. Optional; using an interface never needs it.',
		arguments: [{ name: 'id', description: 'The interface id, the name a skill loads it by.', type: t.string() }],
		options: {
			description: { description: 'What the interface does, in one line.', type: t.string().optional() },
			plugin: {
				description: 'A plugin that defines it. Repeatable, or comma-separated.',
				type: t.array(t.string()).optional(),
			},
			tag: { description: 'A tag. Repeatable, or comma-separated.', type: t.array(t.string()).optional() },
			status: { description: 'Its status, such as `draft` or `stable`.', type: t.string().optional() },
			interface: { description: 'A link to the full interface document.', type: t.string().optional() },
			file: {
				description:
					'A prepared entry: Markdown with an `id` header and any optional field and body. Options given override its fields.',
				type: t.string().optional(),
			},
			seen: {
				description:
					'A near match you read and chose to go on past. Repeatable, or comma-separated; every near match shown must be named.',
				type: t.array(t.string()).optional(),
			},
			as: {
				description:
					'Open this route without asking: `pull-request` (or `pr`) or `issue`. Forces the route over the default.',
				type: t.string().optional(),
			},
			yes: {
				description:
					'Confirm opening the default route. Without it, or `--as`, the command only shows what it would open.',
				type: t.boolean().optional(),
			},
		},
		examples: [
			{
				command: `${path} register release-notes-source --description "Where a release's notes come from."`,
				description: 'Look the id up and show what would be opened',
			},
			{ command: `${path} register release-notes-source --yes`, description: 'Open the default route' },
			{
				command: `${path} register pull-request-host --seen change-request-host --as issue`,
				description: 'Go on past a near match you read, as an issue',
			},
		],
		async run(args: RegisterArgs) {
			const id = args.id.trim()
			if (!interfaceIdPattern.test(id)) {
				usage(
					`\`${id}\` is not an interface id: use letters, digits, and \`-\`, \`_\`, or \`.\` between them.`,
					'id-invalid',
				)
			}
			const forced = args.as === undefined ? undefined : routes[args.as.trim().toLowerCase()]
			if (args.as !== undefined && !forced)
				usage(`\`--as ${args.as}\` is not a route.`, 'route-unknown', 'Use `--as pull-request` or `--as issue`.')
			const entry = entryFrom({ ...args, id })

			try {
				const registry = await readInterfaceRegistry()
				const lookup = lookupInterface(id, entry.description, registry.entries)
				if (lookup.same) {
					throw new CliError(`\`${lookup.same.id}\` is already registered; nothing was recorded.`, {
						code: 'interface-registered',
						details: { id, registered: lookup.same.id, url: interfaceEntryUrl(lookup.same.id) },
						help: [
							`Use the registered interface. Changing its entry is an update: open a pull request that edits ${interfaceEntryUrl(lookup.same.id)}.`,
						],
					})
				}
				const seen = new Set((args.seen ?? []).flatMap((value) => value.split(',')).map((value) => value.trim()))
				const unseen = lookup.near.filter((match) => !seen.has(match.id))
				const base = { id, compared: lookup.compared, ...(lookup.near.length ? { near: lookup.near } : {}) }
				if (unseen.length) {
					return result<ReferenceRegisterReport>(
						{ ...base, recorded: false },
						{
							help: [
								'None of these is taken as the same interface; you decide. Nothing was recorded.',
								`Reuse one, or extend one with a pull request that edits its entry under ${interfaceRegistryUrl}.`,
								`To go on, run again with \`--seen ${unseen.map((match) => match.id).join(',')}\`.`,
							],
						},
					)
				}

				const choice = forced ? { route: forced, why: '`--as` forced it' } : await defaultRoute(gh)
				const shown: ReferenceRegisterReport = {
					...base,
					recorded: false,
					route: choice.route,
					why: choice.why,
					entry: interfaceEntryText(entry),
				}
				if (!forced && !args.yes) {
					return result(shown, {
						help: [
							`Nothing was opened. Run again with \`--yes\` to open the ${choice.route}, or \`--as issue\` / \`--as pull-request\` to choose.`,
						],
					})
				}

				if (choice.route === 'pull-request') {
					const login =
						'login' in choice && choice.login ? choice.login : (await gh(['api', 'user', '--jq', '.login'])).stdout
					if (!login) {
						throw new CliError(
							'The GitHub tool (`gh`) is not signed in, so it cannot open a pull request; nothing was recorded.',
							{
								code: 'github-signed-out',
								help: ['Run `gh auth login`, or use `--as issue`.'],
							},
						)
					}
					const url = await recordAsPullRequest(gh, entry, lookup, login)
					return result<ReferenceRegisterReport>({ ...shown, recorded: true, url })
				}
				const signedIn = (await gh(['auth', 'status'])).ok
				if (!signedIn) {
					return result<ReferenceRegisterReport>(
						{ ...shown, url: newIssueUrl(entry, lookup) },
						{
							help: [
								'The GitHub tool (`gh`) is not signed in, so nothing was filed. Open the url to file the issue, or run `gh auth login` and run again.',
							],
						},
					)
				}
				const url = await recordAsIssue(gh, entry, lookup)
				return result<ReferenceRegisterReport>({ ...shown, recorded: true, url })
			} catch (error) {
				if (isCliError(error)) throw error
				if (error instanceof RegistryUnreachable) {
					throw new CliError(`Cannot read the interface registry (${error.message}); nothing was recorded.`, {
						code: 'registry-unreachable',
						help: ['The lookup reads the live registry, so it needs a network. Run again when GitHub can be reached.'],
					})
				}
				if (error instanceof RecordFailure)
					throw new CliError(`${error.message}. Nothing more was opened.`, { code: 'record-failed' })
				throw new CliError(error instanceof Error ? error.message : 'Register failed.', { cause: error })
			}
		},
	})
}
