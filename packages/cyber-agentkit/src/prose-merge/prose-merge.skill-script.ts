import { fileURLToPath } from 'node:url'
import pkg from '../../package.json' with { type: 'json' }
import plugin from '../../plugin.json' with { type: 'json' }
import { run } from '../cli.js'

// The `merge-prose` skill's `scripts/merge-prose.mjs`; see `src/references/reference.skill-script.ts` for how it is built.
process.exitCode = await run([...process.argv.slice(0, 2), 'prose-merge', ...process.argv.slice(2)], {
	name: plugin.name,
	version: pkg.version,
	root: fileURLToPath(new URL('../../..', import.meta.url)),
})
