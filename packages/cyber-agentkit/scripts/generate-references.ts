// Rewrites each generated reference under `references/` from the library's facts.
// Run with `pnpm run generate:references`; `dependency-reference.test.ts` fails while one is stale.
import { writeFileSync } from 'node:fs'

import { renderDependencyReference } from '../src/dependencies/dependency-reference.ts'

writeFileSync(new URL('../references/plugin-dependencies.md', import.meta.url), renderDependencyReference())
