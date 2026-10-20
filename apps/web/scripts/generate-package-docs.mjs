// Generates the skill and CLI pages of every package under `packages/` from the package's own
// sources (`plugin.json`, `skills/*/SKILL.md`, and the built CLI's `--help --format json`), so the
// pages cannot drift from what the package ships. Editorial text that no source holds (example
// prompts, expected results, CLI examples) lives in `docs-data/<package>.json`.
//
// Output goes to `src/content/docs/packages/<package>/{skills,cli}/`, which is gitignored.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(web, '../..')
const docs = join(web, 'src/content/docs/packages')
const repoUrl = 'https://github.com/spikyuni/cyber-agentkit/tree/main'

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))
const esc = (text) => String(text).replaceAll('|', '\\|')
const yaml = (text) => JSON.stringify(text)

function write(path, content) {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
}

function frontmatter(text) {
	const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
	if (!match) return { meta: {}, body: text }
	const meta = {}
	for (const line of match[1].split('\n')) {
		const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line)
		if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '')
	}
	return { meta, body: match[2] }
}

/** The text under a `## heading`, up to the next `## `. */
function section(body, heading) {
	const lines = body.split('\n')
	const start = lines.findIndex((line) => line === `## ${heading}`)
	if (start < 0) return undefined
	const end = lines.findIndex((line, i) => i > start && line.startsWith('## '))
	return lines
		.slice(start + 1, end < 0 ? undefined : end)
		.join('\n')
		.trim()
}

/** In-page anchors point at headings this page does not have. */
const unlinkAnchors = (text) => text.replace(/\[([^\]]+)\]\(#[^)]*\)/g, '$1')

// ---- skills ---------------------------------------------------------------------------------

function skillPage(pkg, dir, skill, data) {
	const skillDir = join(repo, 'packages', pkg, 'skills', skill)
	const { meta, body } = frontmatter(readFileSync(join(skillDir, 'SKILL.md'), 'utf8'))
	const readmePath = join(skillDir, 'README.md')
	const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : ''
	const lead = readme.split('\n\n')[1] ?? ''
	const route = section(body, 'Route')
	const out = ['---', `title: ${yaml(skill)}`, `description: ${yaml(meta.description ?? '')}`, '---', '']
	out.push(`The \`${skill}\` skill of the \`${dir.pluginName}\` plugin.`, '')
	if (lead) out.push('## What it does', '', lead.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1]($2)'), '')
	out.push(
		'## When it triggers',
		'',
		'The harness loads the skill when a request matches its description:',
		'',
		`> ${meta.description}`,
		'',
	)
	if (route) out.push('## What it handles', '', unlinkAnchors(route), '')
	const examples = data?.skills?.[skill]?.examples
	if (examples?.length) {
		out.push('## Example prompts', '')
		for (const { prompt, result } of examples) out.push(`### ${prompt}`, '', result, '')
	}
	const invocations = /<!-- generated: harness invocations -->\n([\s\S]*?)\n<!-- \/generated -->/.exec(readme)
	if (invocations) {
		out.push('## How to type it in each harness', '', invocations[1], '')
	}
	out.push('## Source', '', `[\`packages/${pkg}/skills/${skill}\`](${repoUrl}/packages/${pkg}/skills/${skill})`, '')
	write(join(docs, pkg, 'skills', `${skill}.md`), out.join('\n'))
	return { skill, description: meta.description ?? '' }
}

function skillsIndex(pkg, rows) {
	const out = [
		'---',
		'title: Skills',
		`description: ${yaml(`Skills the ${pkg} plugin ships.`)}`,
		'sidebar:',
		'  order: 0',
		'---',
		'',
	]
	out.push('| Skill | Use it when |', '| --- | --- |')
	for (const { skill, description } of rows) {
		out.push(`| [\`${skill}\`](/cyber-agentkit/packages/${pkg}/skills/${skill}/) | ${esc(description)} |`)
	}
	write(join(docs, pkg, 'skills', 'index.md'), `${out.join('\n')}\n`)
}

// ---- requires -------------------------------------------------------------------------------

/**
 * Only Claude Code's manifest declares plugin dependencies: a `dependencies` array of `"name"`,
 * `"name@marketplace"`, or `{ name, marketplace, version }` entries (`.research/harness-detection`,
 * claim E-CC-X1). The other harnesses' manifests have no such field, so only
 * `.claude-plugin/plugin.json` is read, and no page is written when it declares none.
 */
function requiresPage(pkg, plugin) {
	const path = join(repo, 'packages', pkg, '.claude-plugin', 'plugin.json')
	const dependencies = existsSync(path) ? readJson(path).dependencies : undefined
	if (!Array.isArray(dependencies) || dependencies.length === 0) return
	const out = [
		'---',
		'title: Requires',
		`description: ${yaml(`Plugins that ${plugin.name} needs enabled.`)}`,
		'sidebar:',
		'  order: 2',
		'---',
		'',
	]
	out.push(
		`These plugins must be enabled for \`${plugin.name}\` to work. Claude Code is the only harness whose manifest declares plugin dependencies, so this list comes from \`.claude-plugin/plugin.json\`.`,
		'',
	)
	out.push(
		'To install them, load the [`plugin-dependencies` reference](https://github.com/spikyuni/cyber-agentkit/blob/main/packages/agent-kit/references/plugin-dependencies.md) through the `reference` skill of `cyber-agentkit`. On a harness other than Claude Code nothing is installed for you.',
		'',
	)
	out.push('| Plugin | Marketplace | Version |', '| --- | --- | --- |')
	for (const dep of dependencies) {
		const entry = typeof dep === 'string' ? { name: dep } : dep
		const [name, inline] = String(entry.name).split('@')
		out.push(`| \`${name}\` | ${entry.marketplace ?? inline ?? "this plugin's own"} | ${entry.version ?? 'any'} |`)
	}
	write(join(docs, pkg, 'requires.md'), `${out.join('\n')}\n`)
}

// ---- CLI ------------------------------------------------------------------------------------

function help(bin, args) {
	const stdout = execFileSync(process.execPath, [bin, ...args, '--help', '--format', 'json'], { encoding: 'utf8' })
	return JSON.parse(stdout)
}

function walk(bin, path = []) {
	const node = help(bin, path)
	const children = (node.commands ?? []).flatMap((c) => walk(bin, [...path, c.name]))
	return [{ path, node }, ...children]
}

function argCell(a) {
	const kind = `${a.type}${a.array ? '[]' : ''}`
	return `| \`${a.name}\` | ${kind} | ${a.required ? 'yes' : 'no'} | ${esc(a.description ?? '')}${a.default === undefined ? '' : ` Default: \`${a.default}\`.`} |`
}

/** Runs an example in the fixture project with an empty home, and hides the machine's paths. */
function runExample(bin, fixture, home, args, root, lines) {
	const result = (() => {
		try {
			return {
				out: execFileSync(process.execPath, [bin, ...args], {
					cwd: fixture,
					env: { ...process.env, HOME: home, USERPROFILE: home },
					encoding: 'utf8',
					stdio: ['ignore', 'pipe', 'pipe'],
				}),
				code: 0,
			}
		} catch (error) {
			return { out: `${error.stdout ?? ''}${error.stderr ?? ''}`, code: error.status ?? 1 }
		}
	})()
	const clean = result.out.replaceAll(fixture, '<project>').replaceAll(home, '~').replaceAll(root, '<plugin>')
	const kept = clean.trimEnd().split('\n')
	return { ...result, out: lines && kept.length > lines ? `${kept.slice(0, lines).join('\n')}\n…` : kept.join('\n') }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Copies what the CLI needs to run into a scratch folder and walks it from there. The package's
 * own `test` task rebuilds `dist/` with `clean: true` while this script may run beside it, so
 * reading `dist/` in place fails whenever the two overlap. A copy that was caught mid-rebuild is
 * thrown away and taken again.
 */
function snapshotCli(pkg, binName, scratch) {
	const source = join(repo, 'packages', pkg)
	for (let attempt = 0; ; attempt++) {
		const copy = join(scratch, `cli-${attempt}`, pkg)
		try {
			for (const entry of ['bin', 'dist', 'plugin.json', 'package.json'])
				cpSync(join(source, entry), join(copy, entry), { recursive: true })
			const bin = join(copy, 'bin', binName)
			return { bin, root: copy, all: walk(bin) }
		} catch (error) {
			if (attempt >= 20) throw error
			sleep(1500)
		}
	}
}

function cliPages(pkg, binName, data) {
	// A copy under a fresh folder with a `.git` marker, so the project tier stops at it instead of
	// walking up through this repository's own folders.
	const scratch = mkdtempSync(join(tmpdir(), 'docs-'))
	const fixture = join(scratch, 'project')
	const home = join(scratch, 'home')
	mkdirSync(home)
	cpSync(join(web, 'fixtures', pkg), fixture, { recursive: true })
	mkdirSync(join(fixture, '.git'))
	const { bin, root, all } = snapshotCli(pkg, binName, scratch)
	const globalOptions = all[0].node.globalOptions ?? []
	const rows = []
	for (const { path, node } of all) {
		if (path.length === 0) continue
		const key = path.join(' ')
		const slug = path.join('-')
		const leaf = !node.commands
		const out = ['---', `title: ${yaml(node.name)}`, `description: ${yaml(node.description)}`, '---', '']
		out.push(node.description, '', '## Synopsis', '', '```text', node.usage, '```', '')
		if (node.commands) {
			out.push('## Subcommands', '', '| Command | What it does |', '| --- | --- |')
			for (const c of node.commands)
				out.push(`| [\`${c.name}\`](/cyber-agentkit/packages/${pkg}/cli/${slug}-${c.name}/) | ${esc(c.description)} |`)
			out.push('')
		}
		if (node.arguments?.length) {
			out.push(
				'## Arguments',
				'',
				'| Argument | Type | Required | Description |',
				'| --- | --- | --- | --- |',
				...node.arguments.map(argCell),
				'',
			)
		}
		if (node.options?.length) {
			out.push(
				'## Options',
				'',
				'| Option | Type | Required | Description |',
				'| --- | --- | --- | --- |',
				...node.options.map((o) => argCell({ ...o, name: `--${o.name}` })),
				'',
			)
		}
		if (leaf) out.push('Every command also takes the [global options](/cyber-agentkit/packages/' + pkg + '/cli/).', '')
		const examples = data?.cli?.[key]?.examples ?? []
		if (examples.length) {
			out.push('## Examples', '')
			for (const example of examples) {
				const args = [...path.slice(0, -1), ...example.args]
				const { out: output, code } = runExample(bin, fixture, home, args, root, example.lines)
				out.push(example.title, '', '```sh', `${binName.replace(/\.mjs$/, '')} ${args.join(' ')}`, '```', '')
				out.push(
					`${example.explain ?? ''}${code === 0 ? '' : ` Exits with code ${code}.`}`.trim(),
					'',
					'```text',
					output,
					'```',
					'',
				)
			}
		}
		write(join(docs, pkg, 'cli', `${slug}.md`), `${out.join('\n')}\n`)
		rows.push({ key, slug, description: node.description, leaf })
	}
	rmSync(scratch, { recursive: true, force: true })
	const intro = [
		'---',
		'title: CLI',
		`description: ${yaml(`The ${all[0].node.name} command line.`)}`,
		'sidebar:',
		'  order: 0',
		'---',
		'',
	]
	intro.push(all[0].node.description, '', '## Run it', '', data?.cli?.$run ?? '', '')
	intro.push('## Commands', '', '| Command | What it does |', '| --- | --- |')
	for (const r of rows)
		intro.push(`| [\`${r.key}\`](/cyber-agentkit/packages/${pkg}/cli/${r.slug}/) | ${esc(r.description)} |`)
	intro.push(
		'',
		'## Global options',
		'',
		'Every command takes these.',
		'',
		'| Option | Type | Description |',
		'| --- | --- | --- |',
	)
	for (const o of globalOptions) {
		const alias = o.aliases?.length ? ` (\`-${o.aliases[0]}\`)` : ''
		const type = o.values ? o.values.join(' \\| ') : o.type
		intro.push(
			`| \`--${o.name}\`${alias} | ${type} | ${esc(o.description)}${o.default === undefined ? '' : ` Default: \`${o.default}\`.`} |`,
		)
	}
	if (data?.cli?.$format) intro.push('', '## Output formats', '', data.cli.$format)
	write(join(docs, pkg, 'cli', 'index.md'), `${intro.join('\n')}\n`)
}

// ---- driver ---------------------------------------------------------------------------------

function ensureBuilt(pkg, files) {
	if (files.every((f) => existsSync(join(repo, 'packages', pkg, f)))) return
	execFileSync('pnpm', ['--filter', `./packages/${pkg}`, 'build'], { cwd: repo, stdio: 'inherit' })
}

for (const pkg of readdirSync(join(repo, 'packages'))) {
	const pluginPath = join(repo, 'packages', pkg, 'plugin.json')
	if (!existsSync(pluginPath)) continue
	const plugin = readJson(pluginPath)
	const dataPath = join(web, 'docs-data', `${pkg}.json`)
	const data = existsSync(dataPath) ? readJson(dataPath) : undefined
	rmSync(join(docs, pkg, 'skills'), { recursive: true, force: true })
	rmSync(join(docs, pkg, 'cli'), { recursive: true, force: true })
	rmSync(join(docs, pkg, 'requires.md'), { force: true })
	requiresPage(pkg, plugin)

	const skillsRoot = join(repo, 'packages', pkg, 'skills')
	if (existsSync(skillsRoot)) {
		const skills = readdirSync(skillsRoot, { withFileTypes: true }).filter(
			(e) => e.isDirectory() && existsSync(join(skillsRoot, e.name, 'SKILL.md')),
		)
		skillsIndex(
			pkg,
			skills.map((e) => skillPage(pkg, { pluginName: plugin.name }, e.name, data)),
		)
	}

	const bins = existsSync(join(repo, 'packages', pkg, 'bin')) ? readdirSync(join(repo, 'packages', pkg, 'bin')) : []
	if (bins[0]) {
		ensureBuilt(pkg, ['dist/cli.js'])
		cliPages(pkg, bins[0], data)
	}
}
