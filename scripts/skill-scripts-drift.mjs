/**
 * Prebuilt skill script drift.
 *
 * The marketplace installs cyber-agentkit from `packages/cyber-agentkit` on `main`, and `npx skills`
 * copies skill folders from the repository, so the compiled `skills/<name>/scripts/*.mjs` files
 * committed on `main` are what users run. This check asks `universal-plugin plugin build --dry-run`
 * whether a fresh build would change any of them, and fails naming each one that it would.
 *
 * Only the scripts are checked. The dry run reports the vendor manifests as `built` whether or not
 * they would change, so it cannot tell a stale manifest from a current one.
 */

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLUGIN_ROOT = 'packages/cyber-agentkit'
export const FIX_COMMAND = 'pnpm plugin:build'

/**
 * Reads the dry-run report and returns the scripts a fresh build would change, as
 * `{ path, source, status }`, with `path` relative to the repository root.
 */
export function findStaleScripts(report) {
	if (!Array.isArray(report?.scripts)) {
		throw new Error('the build report lists no scripts; has the universal-plugin output changed?')
	}
	return report.scripts
		.filter((script) => script.status !== 'unchanged')
		.map(({ path, source, status }) => ({
			path: `${PLUGIN_ROOT}/${path}`,
			source: `${PLUGIN_ROOT}/${source}`,
			status,
		}))
}

/** Formats the failure message for the stale scripts. */
export function formatStale(stale) {
	return [
		`${stale.length} prebuilt skill script(s) do not match a fresh build of their source:`,
		...stale.map(({ path, source, status }) => `  ${path} (${status}, built from ${source})`),
		'',
		`Run \`${FIX_COMMAND}\` and commit the rebuilt scripts.`,
	].join('\n')
}

/** Runs the dry build. Its warnings go to stderr, shown only when the build itself fails. */
function runDryBuild(repoRoot) {
	let output
	try {
		output = execFileSync(
			'pnpm',
			['exec', 'universal-plugin', 'plugin', 'build', '--root', PLUGIN_ROOT, '--dry-run', '--format', 'json'],
			{ cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' },
		)
	} catch (error) {
		process.stderr.write(error.stderr ?? '')
		throw error
	}
	return JSON.parse(output)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
	const report = runDryBuild(repoRoot)
	if (report.failed?.length) {
		process.stderr.write(`the build failed: ${JSON.stringify(report.failed)}\n`)
		process.exit(1)
	}
	const stale = findStaleScripts(report)
	if (stale.length > 0) {
		process.stderr.write(`${formatStale(stale)}\n`)
		process.exit(1)
	}
	process.stdout.write(`${report.scripts.length} prebuilt skill scripts match their source.\n`)
}
