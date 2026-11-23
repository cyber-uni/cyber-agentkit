import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { installedPlugins } from '../../plugins/installed-plugins.js'
import { referenceLayers } from '../../references/reference-layers.js'
import { checkScriptMain } from '../check-script-main.js'
import { runResolver } from '../input-hashes.js'
import { dependencySkillFolders } from '../plugin-load.js'
import { findSkillPlugin } from '../skill-plugin.js'
import { checkStaleCases } from '../stale-checks.js'
import { checkVerification } from '../verification-checks.js'

// The default Verification aspect's check script, `skills/skill/scripts/check-verification.mjs`. A stale case is found
// against the inputs a run resolves (R179), so the named references resolve as `skill test` resolves them, with the
// plugin that ships this script as the host.
const host = findSkillPlugin(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
// Layers that cannot be read leave each named reference counted by its name, which shows its scope's cases stale.
const layers = await referenceLayers({
	cwd: process.cwd(),
	home: homedir(),
	platform: process.platform,
	env: process.env,
	plugin: host,
}).catch(() => undefined)
// The other skills a run loads, those of the plugins the skill's plugin depends on, are found from Claude Code's installed plugins.
const skillArg = process.argv[2]
const dependencySkills = skillArg
	? await dependencySkillFolders(resolve(skillArg), {
			installed: await installedPlugins('claude-code')
				.then((read) => read.plugins)
				.catch(() => []),
		})
	: []
process.exitCode = checkScriptMain((skill) => {
	const outcomes = checkVerification(skill)
	const readable = outcomes.find((outcome) => outcome.id === 'VER-1')?.status === 'pass'
	return [
		...outcomes,
		...(readable
			? checkStaleCases(skill, {
					otherSkills: dependencySkills,
					...(layers ? { resolve: runResolver(layers, skill.folder) } : {}),
				})
			: ['VER-18', 'VER-19'].map((id): (typeof outcomes)[number] => ({
					id,
					status: 'not-checked',
					message: 'VER-1 failed',
				}))),
	]
})
