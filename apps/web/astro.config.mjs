// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
	site: 'https://cyberuni-agent.github.io',
	base: '/uni-agent-kit',
	integrations: [
		starlight({
			title: 'uni-agent-kit',
			description:
				'Detect which AI agent harness is running, such as Claude Code, Cursor, Codex, or Copilot CLI, and query what it holds.',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/cyberuni-agent/uni-agent-kit' }],
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
