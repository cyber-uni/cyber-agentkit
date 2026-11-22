import { readFileSync } from 'node:fs'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { CliError, isCliError, result } from 'clibuilder/axi'
import {
	type CapabilityEntry,
	capabilityEntryText,
	capabilitySystemPattern,
	parseCapabilityEntry,
} from '../capability-registry/capability-entry.js'
import {
	capabilityArea,
	capabilityEntryUrl,
	capabilityRegistryUrl,
	lookupCapability,
	readCapabilityRegistry,
} from '../capability-registry/capability-registry.js'
import { capabilitiesSuffix } from '../references/reference-capabilities.js'
import { gh } from './github-cli.js'
import { type InterfaceEntry, interfaceEntryText, interfaceIdPattern, parseInterfaceEntry } from './interface-entry.js'
import { lookupInterface, type NearMatch } from './interface-lookup.js'
import {
	defaultRoute,
	newIssueUrl,
	RecordFailure,
	type RecordRoute,
	type RegistryRequest,
	type RequestLookup,
	recordAsIssue,
	recordAsPullRequest,
} from './interface-record.js'
import {
	interfaceArea,
	interfaceEntryUrl,
	interfaceRegistryUrl,
	RegistryUnreachable,
	readInterfaceRegistry,
} from './interface-registry.js'

export type ReferenceRegisterReport = {
	id: string
	/** For `<system>.capabilities`, the system whose capability registry entry this is. */
	system?: string
	/** Whether an issue or pull request was opened. */
	recorded: boolean
	route?: RecordRoute
	/** Why the route was taken: the default's reason, or that an option forced it. */
	why?: string
	/** The issue or pull request opened, or the new-issue page to open when the GitHub tool could not. */
	url?: string
	/** How many registered interfaces, or systems for a capability reference, the lookup compared. */
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
	blueprint: string[] | undefined
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

function readEntryFile<Entry>(
	file: string,
	name: string,
	parse: (text: string, fileId: string) => { entry: Entry; problems: string[] },
): Entry {
	let text: string
	try {
		text = readFileSync(file, 'utf8')
	} catch {
		usage(`Cannot read the entry file \`${file}\`.`, 'entry-unreadable')
	}
	const parsed = parse(text, name)
	if (parsed.problems.length) {
		usage(`The entry file \`${file}\` has problems: ${parsed.problems.join('; ')}.`, 'entry-invalid')
	}
	return parsed.entry
}

const list = (values: string[] | undefined) =>
	values
		?.flatMap((value) => value.split(','))
		.map((value) => value.trim())
		.filter(Boolean)

/** The fields both kinds of entry take from the command line, each over the same field of `--file`. */
function sharedFields<Entry extends Pick<InterfaceEntry, 'description' | 'plugins' | 'tags' | 'status'>>(
	entry: Entry,
	args: RegisterArgs,
): Entry {
	if (args.description?.trim()) entry.description = args.description.trim()
	const plugins = list(args.plugin)
	if (plugins?.length) entry.plugins = plugins.map((name) => ({ name }))
	const tags = list(args.tag)
	if (tags?.length) entry.tags = tags
	if (args.status?.trim()) entry.status = args.status.trim()
	return entry
}

/** The interface entry to record: from `--file` when given, with each option given on the command line over it. */
function interfaceEntryFrom(args: RegisterArgs): InterfaceEntry {
	const entry = sharedFields<InterfaceEntry>(
		args.file === undefined ? { id: args.id } : readEntryFile(args.file, args.id, parseInterfaceEntry),
		args,
	)
	if (args.interface?.trim()) entry.interface = args.interface.trim()
	return entry
}

/** The system's entry to record, the same way. `--blueprint` names a blueprint built on it. */
function capabilityEntryFrom(system: string, args: RegisterArgs): CapabilityEntry {
	const entry = sharedFields<CapabilityEntry>(
		args.file === undefined ? { system } : readEntryFile(args.file, system, parseCapabilityEntry),
		args,
	)
	const blueprints = list(args.blueprint)
	if (blueprints?.length) entry.blueprints = blueprints.map((name) => ({ name }))
	return entry
}

/** What registering one name needs: where it goes, its entry, and how to look it up. */
type Registration = {
	request: RegistryRequest
	system?: string
	lookup(): Promise<RequestLookup & { same?: string }>
	/** The error for a name already registered. */
	registered(same: string): CliError
	folderUrl: string
	/** Which registry, for the unreachable error. */
	registry: string
}

function registration(id: string, args: RegisterArgs): Registration {
	if (id.endsWith(capabilitiesSuffix)) {
		const system = id.slice(0, -capabilitiesSuffix.length)
		if (!capabilitySystemPattern.test(system)) {
			usage(
				`\`${id}\` names no system: \`<system>.capabilities\` takes one name segment, letters, digits, and \`-\` or \`_\` between them.`,
				'id-invalid',
			)
		}
		if (args.interface !== undefined)
			usage('`--interface` is for an interface; a capability reference implements none.', 'option-not-for-capabilities')
		const entry = capabilityEntryFrom(system, args)
		return {
			request: { area: capabilityArea, name: system, text: capabilityEntryText(entry) },
			system,
			async lookup() {
				const found = lookupCapability(system, entry.description, (await readCapabilityRegistry()).entries)
				return found.same ? { ...found, same: found.same.system } : { near: found.near, compared: found.compared }
			},
			registered: (same) =>
				new CliError(`\`${same}\` is already in the capability registry; nothing was recorded.`, {
					code: 'capability-registered',
					details: { id, registered: same, url: capabilityEntryUrl(same) },
					help: [
						`Use the registered system's entry. Adding your plugin or a blueprint to it is an update: open a pull request that edits ${capabilityEntryUrl(same)}.`,
					],
				}),
			folderUrl: capabilityRegistryUrl,
			registry: 'capability registry',
		}
	}
	if (!interfaceIdPattern.test(id)) {
		usage(
			`\`${id}\` is not an interface id: use letters, digits, and \`-\`, \`_\`, or \`.\` between them.`,
			'id-invalid',
		)
	}
	if (args.blueprint !== undefined)
		usage('`--blueprint` is for a capability reference, `<system>.capabilities`.', 'option-not-for-interfaces')
	const entry = interfaceEntryFrom({ ...args, id })
	return {
		request: { area: interfaceArea, name: id, text: interfaceEntryText(entry) },
		async lookup() {
			const found = lookupInterface(id, entry.description, (await readInterfaceRegistry()).entries)
			return found.same ? { ...found, same: found.same.id } : { near: found.near, compared: found.compared }
		},
		registered: (same) =>
			new CliError(`\`${same}\` is already registered; nothing was recorded.`, {
				code: 'interface-registered',
				details: { id, registered: same, url: interfaceEntryUrl(same) },
				help: [
					`Use the registered interface. Changing its entry is an update: open a pull request that edits ${interfaceEntryUrl(same)}.`,
				],
			}),
		folderUrl: interfaceRegistryUrl,
		registry: 'interface registry',
	}
}

export function registerCommand(path: string): cli.Command {
	return command({
		name: 'register',
		description:
			"Record a reference interface, or a system's capability reference (`<system>.capabilities`), in the public registry so others can find it: look the name up first, stop on the same name or show near matches, then open a pull request or an issue only when confirmed. Optional; using either never needs it.",
		arguments: [
			{
				name: 'id',
				description:
					'The interface id, the name a skill loads it by, or `<system>.capabilities` to register a system in the capability registry.',
				type: t.string(),
			},
		],
		options: {
			description: {
				description: 'What the interface does, or what the system is, in one line.',
				type: t.string().optional(),
			},
			plugin: {
				description:
					'A plugin that defines the interface, or ships the capability reference. Repeatable, or comma-separated.',
				type: t.array(t.string()).optional(),
			},
			blueprint: {
				description:
					'For `<system>.capabilities`: a blueprint built on it, by its full name. Repeatable, or comma-separated.',
				type: t.array(t.string()).optional(),
			},
			tag: { description: 'A tag. Repeatable, or comma-separated.', type: t.array(t.string()).optional() },
			status: { description: 'Its status, such as `draft` or `stable`.', type: t.string().optional() },
			interface: { description: 'A link to the full interface document.', type: t.string().optional() },
			file: {
				description:
					'A prepared entry: Markdown with an `id` header (`system` for a capability reference) and any optional field and body. Options given override its fields.',
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
			{
				command: `${path} register asana.capabilities --plugin cyber-asana --blueprint project-tracker.blueprints.asana.sections`,
				description: 'Register a system, with the plugin that ships its capability reference and a blueprint on it',
			},
		],
		async run(args: RegisterArgs) {
			const id = args.id.trim()
			const forced = args.as === undefined ? undefined : routes[args.as.trim().toLowerCase()]
			if (args.as !== undefined && !forced)
				usage(`\`--as ${args.as}\` is not a route.`, 'route-unknown', 'Use `--as pull-request` or `--as issue`.')
			const plan = registration(id, args)
			const { request } = plan

			try {
				const lookup = await plan.lookup()
				if (lookup.same) throw plan.registered(lookup.same)
				const seen = new Set((args.seen ?? []).flatMap((value) => value.split(',')).map((value) => value.trim()))
				const unseen = lookup.near.filter((match) => !seen.has(match.id))
				const base = {
					id,
					...(plan.system ? { system: plan.system } : {}),
					compared: lookup.compared,
					...(lookup.near.length ? { near: lookup.near } : {}),
				}
				if (unseen.length) {
					return result<ReferenceRegisterReport>(
						{ ...base, recorded: false },
						{
							help: [
								`None of these is taken as the same ${plan.system ? 'system' : 'interface'}; you decide. Nothing was recorded.`,
								`Reuse one, or extend one with a pull request that edits its entry under ${plan.folderUrl}.`,
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
					entry: request.text,
				}
				if (!forced && !args.yes) {
					return result(shown, {
						help: [
							`Nothing was opened. Run again with \`--yes\` to open the ${choice.route === 'pull-request' ? 'pull request' : 'issue'}, or \`--as issue\` / \`--as pull-request\` to choose.`,
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
					const url = await recordAsPullRequest(gh, request, lookup, login)
					return result<ReferenceRegisterReport>({ ...shown, recorded: true, url })
				}
				const signedIn = (await gh(['auth', 'status'])).ok
				if (!signedIn) {
					return result<ReferenceRegisterReport>(
						{ ...shown, url: newIssueUrl(request, lookup) },
						{
							help: [
								'The GitHub tool (`gh`) is not signed in, so nothing was filed. Open the url to file the issue, or run `gh auth login` and run again.',
							],
						},
					)
				}
				const url = await recordAsIssue(gh, request, lookup)
				return result<ReferenceRegisterReport>({ ...shown, recorded: true, url })
			} catch (error) {
				if (isCliError(error)) throw error
				if (error instanceof RegistryUnreachable) {
					throw new CliError(`Cannot read the ${plan.registry} (${error.message}); nothing was recorded.`, {
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
