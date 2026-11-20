#!/usr/bin/env node
// `dist/cli.js` is built by `pnpm build` (see `tsdown.config.ts`) and is not committed. The import is a
// literal relative path so a skill's forwarder can see it is missing, as in a git-sourced install, and
// run the published CLI instead.
import { run } from '../dist/cli.js'

// The process boundary — the only place that reads `process.argv` or writes `process.exitCode`.
process.exitCode = await run(process.argv)
