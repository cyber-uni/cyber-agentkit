// @ts-check

import { readdirSync } from 'node:fs'
import starlight from '@astrojs/starlight'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

// One sidebar group per package under `src/content/docs/packages/`, each laid out the same way
// (overview, install, skills, CLI, library API) through `autogenerate`, so a new package needs no entry here.
const packages = readdirSync(new URL('./src/content/docs/packages/', import.meta.url), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => ({ label: entry.name, items: [{ autogenerate: { directory: `packages/${entry.name}` } }] }))

export default defineConfig({
	site: 'https://spikyuni.github.io',
	base: '/uni-agent-kit',
	vite: { plugins: [tailwindcss()] },
	integrations: [
		starlight({
			title: 'uni-agent-kit',
			description:
				'Detect which AI agent harness is running, such as Claude Code, Cursor, Codex, or Copilot CLI, and query what it holds.',
			// The cyber-* family mark: a shared command reticle around a per-package glyph. The favicon
			// self-themes under `prefers-color-scheme`. The header logo cannot, because Starlight switches
			// on `data-theme`, so it ships as a light and dark pair.
			favicon: '/img/logo.svg',
			logo: { light: './src/assets/logo-light.svg', dark: './src/assets/logo-dark.svg', alt: 'uni-agent-kit' },
			customCss: ['./src/styles/global.css'],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/spikyuni/uni-agent-kit' }],
			sidebar: [
				{ label: 'Packages', items: packages },
				{
					label: 'Concepts',
					items: [
						{ label: 'Harness detection', slug: 'concepts/harness-detection' },
						{ label: 'Reference documents', slug: 'concepts/reference-documents' },
						{ label: 'Reference interfaces', slug: 'concepts/reference-interfaces' },
					],
				},
			],
		}),
	],
})
