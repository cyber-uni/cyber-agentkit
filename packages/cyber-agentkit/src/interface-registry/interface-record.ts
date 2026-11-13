import type { Gh } from './github-cli.js'
import { type InterfaceEntry, interfaceEntryText } from './interface-entry.js'
import type { InterfaceLookup, NearMatch } from './interface-lookup.js'
import { interfaceRegistry } from './interface-registry.js'

/** How an entry reaches the registry: a pull request adding its file, or an issue carrying it as text. */
export type RecordRoute = 'pull-request' | 'issue'

export type RouteChoice = { route: RecordRoute; why: string; login?: string }

const upstream = `${interfaceRegistry.owner}/${interfaceRegistry.repo}`

/**
 * The default route: a pull request when the GitHub tool is signed in and the registry repository
 * allows forks, otherwise an issue. It only chooses; nothing is opened here.
 */
export async function defaultRoute(run: Gh): Promise<RouteChoice> {
	const user = await run(['api', 'user', '--jq', '.login'])
	if (!user.ok || !user.stdout)
		return { route: 'issue', why: 'the GitHub tool (`gh`) is not signed in, so it cannot fork and push' }
	const forking = await run(['api', `repos/${upstream}`, '--jq', '.allow_forking'])
	if (!forking.ok || forking.stdout !== 'true') {
		return { route: 'issue', why: `${upstream} cannot be forked by \`${user.stdout}\``, login: user.stdout }
	}
	return {
		route: 'pull-request',
		why: `the GitHub tool is signed in as \`${user.stdout}\` and can fork ${upstream}`,
		login: user.stdout,
	}
}

function nearLines(near: readonly NearMatch[]): string[] {
	return near.map(({ id, reasons }) => `- \`${id}\`: ${reasons.join('; ')}`)
}

/** The lookup result both routes carry, so the reviewer sees what was compared and what was shown. */
export function lookupSummary(lookup: InterfaceLookup): string {
	const compared = `The lookup compared it against ${lookup.compared} registered interface${lookup.compared === 1 ? '' : 's'}.`
	if (!lookup.near.length) return `${compared} It found no near matches.`
	return [
		`${compared} These near matches were shown, and the registrant chose to go on:`,
		'',
		...nearLines(lookup.near),
	].join('\n')
}

export function requestTitle(id: string, route: RecordRoute): string {
	return route === 'pull-request'
		? `docs(registry): register the ${id} interface`
		: `Register the ${id} reference interface`
}

export function requestBody(entry: InterfaceEntry, lookup: InterfaceLookup, route: RecordRoute): string {
	const path = `${interfaceRegistry.folder}/${entry.id}.md`
	const lines = [`Registers the \`${entry.id}\` reference interface.`, '', '## Lookup', '', lookupSummary(lookup), '']
	if (route === 'pull-request') lines.push('## Entry', '', `Adds \`${path}\`.`)
	else {
		lines.push(
			'## Entry',
			'',
			`A maintainer turns this into \`${path}\`:`,
			'',
			'````md',
			interfaceEntryText(entry).trimEnd(),
			'````',
		)
	}
	lines.push('', 'Opened by `cyber-agentkit reference register`.')
	return `${lines.join('\n')}\n`
}

/** The new-issue page with the request filled in, for when the GitHub tool cannot open it. */
export function newIssueUrl(entry: InterfaceEntry, lookup: InterfaceLookup): string {
	const params = new URLSearchParams({
		title: requestTitle(entry.id, 'issue'),
		body: requestBody(entry, lookup, 'issue'),
	})
	return `https://github.com/${upstream}/issues/new?${params.toString()}`
}

export class RecordFailure extends Error {
	override name = 'RecordFailure'
}

async function must(run: Gh, args: readonly string[], what: string): Promise<string> {
	const result = await run(args)
	if (!result.ok) throw new RecordFailure(`${what} failed: ${result.stderr || 'no message'}`)
	return result.stdout
}

/** Opens an issue carrying the entry and the lookup result, and gives its url. */
export async function recordAsIssue(run: Gh, entry: InterfaceEntry, lookup: InterfaceLookup): Promise<string> {
	return must(
		run,
		[
			'issue',
			'create',
			'-R',
			upstream,
			'--title',
			requestTitle(entry.id, 'issue'),
			'--body',
			requestBody(entry, lookup, 'issue'),
		],
		'Opening the issue',
	)
}

/**
 * Forks the registry repository, commits the entry file to a branch of the fork, and opens a pull
 * request from it, giving its url. Nothing is written outside the registry request.
 */
export async function recordAsPullRequest(
	run: Gh,
	entry: InterfaceEntry,
	lookup: InterfaceLookup,
	login: string,
): Promise<string> {
	const { repo, branch: base, folder } = interfaceRegistry
	const fork = `${login}/${repo}`
	const branch = `register-interface/${entry.id}`
	await must(run, ['repo', 'fork', upstream, '--clone=false', '--remote=false'], 'Forking the registry repository')
	const sha = await must(
		run,
		['api', `repos/${upstream}/git/ref/heads/${base}`, '--jq', '.object.sha'],
		`Reading ${base}`,
	)
	const ref = await run([
		'api',
		'-X',
		'POST',
		`repos/${fork}/git/refs`,
		'-f',
		`ref=refs/heads/${branch}`,
		'-f',
		`sha=${sha}`,
	])
	if (!ref.ok && !/already exists/i.test(ref.stderr))
		throw new RecordFailure(`Creating the branch failed: ${ref.stderr}`)
	const content = Buffer.from(interfaceEntryText(entry), 'utf8').toString('base64')
	await must(
		run,
		[
			'api',
			'-X',
			'PUT',
			`repos/${fork}/contents/${folder}/${entry.id}.md`,
			'-f',
			`message=${requestTitle(entry.id, 'pull-request')}`,
			'-f',
			`content=${content}`,
			'-f',
			`branch=${branch}`,
		],
		'Committing the entry',
	)
	return must(
		run,
		[
			'pr',
			'create',
			'-R',
			upstream,
			'--base',
			base,
			'--head',
			`${login}:${branch}`,
			'--title',
			requestTitle(entry.id, 'pull-request'),
			'--body',
			requestBody(entry, lookup, 'pull-request'),
		],
		'Opening the pull request',
	)
}
