// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://cyberuni.github.io',
	base: '/agent-harness',
	integrations: [
		starlight({
			title: 'agent-harness',
			description:
				'Detect which AI agent harness is running, such as Claude Code, Cursor, Codex, or Copilot CLI, and query what it holds.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/cyberuni/agent-harness' }],
			sidebar: [
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
