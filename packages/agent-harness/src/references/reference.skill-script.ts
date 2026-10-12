import { fileURLToPath } from 'node:url'
import pkg from '../../package.json' with { type: 'json' }
import plugin from '../../plugin.json' with { type: 'json' }
import { run } from '../cli.js'

// The `reference` skill's `scripts/reference.mjs`, three folders under the plugin root:
// `skills/reference/scripts/`. The plugin root is where this package's own `references/` sit.
// `plugin build` compiles this file (see `scripts` in `plugin.json`); the two manifests are
// inlined as JSON, so the one `.mjs` ships with no manifest beside it.
//
// Composed into a fresh argv, not spliced into the global one, so nothing outside this file
// observes the rewrite.
process.exitCode = await run([...process.argv.slice(0, 2), 'reference', ...process.argv.slice(2)], {
	name: plugin.name,
	version: pkg.version,
	root: fileURLToPath(new URL('../../..', import.meta.url)),
})
