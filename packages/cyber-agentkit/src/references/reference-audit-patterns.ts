/**
 * What the audit looks for. A match is a lead for the agent to judge, never a verdict. The lists start
 * small and grow from use; `--also` adds terms for one run without a change here.
 */

/** Git hosts, trackers, and services a skill may name; matched as whole words, ignoring case. */
export const providerTerms: readonly string[] = [
	'GitHub',
	'GitLab',
	'Bitbucket',
	'Azure DevOps',
	'Jira',
	'Asana',
	'Trello',
	'Slack',
	'Sentry',
]

/** Names too common as words to match without their capital letter. */
export const providerTermsExact: readonly string[] = ['Linear', 'Notion']

/** Command-line tools; matched as a command, with the subcommand that follows it. */
export const toolNames: readonly string[] = [
	'gh',
	'glab',
	'git',
	'npm',
	'pnpm',
	'yarn',
	'npx',
	'docker',
	'kubectl',
	'terraform',
	'prettier',
	'eslint',
	'biome',
	'jest',
	'vitest',
	'curl',
	'aws',
	'gcloud',
]

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
