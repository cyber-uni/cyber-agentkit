# Evidence: skill-evals

Confidence: H high, M medium, L low. Read 2026-11-10. "Unverified" means the claim was not found in a source.

## E1 promptfoo repo facts
- Claim: MIT license. Latest release 0.125.1 on 2026-10-25. Pushed 2026-11-09. About 27,000 stars. TypeScript. The README says "Promptfoo is now part of OpenAI" and that it "remains open source and MIT licensed".
- Source: https://github.com/promptfoo/promptfoo (GitHub API for license, release, push date)
- Confidence: H.

## E2 promptfoo npm package
- Claim: npm `promptfoo` 0.125.1, license MIT, `engines.node >=22.22.0`.
- Source: https://www.npmjs.com/package/promptfoo (read with `npm view`)
- Confidence: H.

## E3 promptfoo as a Node library
- Claim: `import promptfoo from 'promptfoo'; await promptfoo.evaluate(testSuite, options)` then `toEvaluateSummary()`. Summary has `results` (with `success`, `score`, `response`) and `stats`. Providers can be functions. Transform functions are not saved when `writeLatestResults` is true. Node 22.22 or newer.
- Source: https://www.promptfoo.dev/docs/usage/node-package/
- Confidence: H.

## E4 promptfoo Claude Agent SDK provider
- Claim: id `anthropic:claude-agent-sdk`. `working_dir` and `copy_working_dir` (fresh copy per step, never cached). `sandbox` object. Skills found through `setting_sources` or local plugins. Skill calls normalized to `metadata.skillCalls`, with a `skill-used` assertion. Returns output, tool calls, cost and token usage. "skills is a context filter, not a sandbox".
- Source: https://www.promptfoo.dev/docs/providers/claude-agent-sdk/
- Confidence: H.

## E5 promptfoo Codex SDK provider
- Claim: ephemeral thread per test case. `sandbox_mode` read-only, workspace-write (default), danger-full-access, filesystem only. Network set separately. Needs a git repo unless `skip_git_repo_check`. `metadata.skillCalls` is heuristic from command text. Install with `@openai/codex-sdk`.
- Source: https://www.promptfoo.dev/docs/providers/openai-codex-sdk/
- Confidence: H.

## E6 promptfoo provider list and exec provider
- Claim: providers include `anthropic:claude-agent-sdk`, `openai:codex-sdk`, `openai:codex-app-server` (experimental), `opencode:sdk`, `exec:`. Copilot, Cursor, Gemini CLI, ACP not listed. `exec:` passes prompt, options, context as three arguments and takes stdout as output.
- Sources: https://www.promptfoo.dev/docs/providers/ ; https://www.promptfoo.dev/docs/providers/custom-script/
- Confidence: H for the list as fetched. Absence of Copilot and Cursor is as of the fetch only.

## E7 promptfoo llm-rubric
- Claim: judge returns JSON with `reason`, `score` (0.0 to 1.0) and `pass`. Without a threshold, `pass` decides. Custom `rubricPrompt`. Grader provider can be overridden.
- Source: https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/llm-rubric/
- Confidence: H.

## E8 promptfoo repeat, threshold, outputs
- Claim: `evaluateOptions.repeat` runs each case N times (default 1). Test `threshold` fails the test if the combined assertion score is below it. Output formats csv, txt, json, jsonl, yaml, html, xml, junit.xml. No dedicated run comparison feature was described. Caching on by default, `cache: false` to disable.
- Source: https://www.promptfoo.dev/docs/configuration/reference/
- Confidence: H for the options. A pass rate across repeats: unverified. A with-skill versus without-skill comparison via two providers: unverified (inference).

## E9 claude plugin eval
- Claim: needs Claude Code 2.1.269 or newer. Each case is a prompt plus graders. Grader types regex, tool_used, tool_order, file_exists, llm (2 of 3 judge votes), baseline. 3 runs per case by default, case score is the mean of run scores, `--threshold` default 1.0, exit code 1 below it. No-plugin arm gives WITH, W/OUT and Delta. Skill-invoked graders are excluded from the without arm. Each run has a temp home, workspace and config, as a `claude -p` child with only the plugin loaded. Bash runs under the OS sandbox. Scaffold scripts and real MCP servers run outside the sandbox. Output `aggregate-result.json` (schemaVersion 1) and `report.html`. `--json` for CI. Manifest key is `experimental.evals`. skill-creator uses a different case format and neither reads the other's files.
- Source: https://code.claude.com/docs/en/plugin-evals
- Confidence: H. Flags beyond those on the page (from a third-party blog at https://aiidelist.com/blog/claude-code-plugin-eval.md): L, not used.

## E10 anthropics/skills skill-creator
- Claim: folder holds SKILL.md, scripts (run_eval.py, run_loop.py, aggregate_benchmark.py, improve_description.py and more), agents (grader, analyzer, comparator), eval-viewer. `run_eval.py` runs `claude -p` with stream-json to detect trigger. Trigger queries run 3 times each, 60/40 train and test split. Outcome runs use with-skill and baseline subagents (`without_skill` or `old_skill`), `grading.json` with `text`, `passed`, `evidence`, and `benchmark.json` with mean, stddev, delta. LICENSE.txt is Apache 2.0. The folder's last commit is 2026-04-20.
- Source: https://github.com/anthropics/skills/tree/main/skills/skill-creator (files read through the GitHub API)
- Confidence: H. Whether the whole repo is Apache 2.0: unverified. Only the folder LICENSE.txt was read.

## E11 Inspect AI repo
- Claim: MIT. Release 0.3.288 on 2026-11-07. Pushed 2026-11-10. Python.
- Source: https://github.com/UKGovernmentBEIS/inspect_ai
- Confidence: H.

## E12 Inspect AI features
- Claim: `--epochs` with reducers (mean, median, mode, max, at_least_n, pass_at_k, pass_k_k). Log dir default `./logs`, format `eval` or `json`. Docker and local sandboxes built in, k8s and others external. Docker network off with `network_mode: none`. `model_graded_qa` and `model_graded_fact` exist. Their grade scale and mapping to pass or fail: unverified.
- Sources: https://inspect.aisi.org.uk/options.html ; https://inspect.aisi.org.uk/sandboxing.html ; https://inspect.aisi.org.uk/scorers.html
- Confidence: H, except the unverified item.

## E13 inspect_swe
- Claim: `claude_code()`, `codex_cli()`, `gemini_cli()`, `kimi_code()`, `opencode()`, `mini_swe_agent()` as Inspect agents. They run inside the sample sandbox and proxy model calls through `sandbox_agent_bridge()`. `pip install inspect-swe`. MIT (GitHub API). Pushed 2026-11-10.
- Sources: https://meridianlabs-ai.github.io/inspect_swe ; https://github.com/meridianlabs-ai/inspect_swe
- Confidence: H. Whether Docker is required: unverified (the example uses it).

## E14 evalite
- Claim: repo archived. README says "Evalite is deprecated", no longer maintained, recommends Langfuse. Last release evalite@0.19.0 on 2025-11-06. MIT.
- Source: https://github.com/mattpocock/evalite
- Confidence: H.

## E15 autoevals
- Claim: MIT. js-0.4.1 and py-0.4.1 on 2026-10-21. npm `autoevals` 0.4.1. Provides model-graded scorers such as Factuality. No agent runner.
- Sources: https://github.com/braintrustdata/autoevals ; npm registry
- Confidence: H. Harness driving: none found.

## E16 vitest-evals
- Claim: repo getsentry/vitest-evals, Apache 2.0, v0.18.1 on 2026-11-07. Harness packages for AI SDK, OpenAI Agents and pi-ai. Judges with `judgeThreshold`. GitHub action with `min-pass-rate`. JSON report and local report UI. Peer dependency vitest 5.
- Sources: https://github.com/getsentry/vitest-evals ; its packages/vitest-evals/README.md ; npm registry
- Confidence: H. Repeats per case: unverified.

## E17 DeepEval
- Claim: Apache 2.0 (GitHub API). python-v4.2.4 on 2026-09-22. Python with pytest and a TypeScript package with Vitest. G-Eval with a 0-1 threshold. Agent metrics for frameworks. Results cached locally, JSON folder, SQLite, or Confident AI. Repeats and sandbox: unverified.
- Sources: https://github.com/confident-ai/deepeval ; https://deepeval.com/docs/getting-started
- Confidence: H for license and release. M for features (summary of one page).

## E18 OpenAI Evals
- Claim: repo openai/evals, last push 2026-04-14, GitHub API license NOASSERTION, page says MIT. Banner says evals can be run in the OpenAI Dashboard. Model-graded YAML evals supported. Agent support is implied through completion functions only.
- Source: https://github.com/openai/evals
- Confidence: M.

## Unverified list
- Cursor and Copilot CLI drivers for any candidate.
- Inspect AI model-graded grade scale.
- DeepEval repeats and sandboxing.
- vitest-evals repeats per case.
- OpenAI Evals agent support and CI use.
- Whether inspect_swe requires Docker.
- Whether the whole anthropics/skills repo is Apache 2.0.
- Whether `claude plugin eval` leaves experimental status.

## E19. Popularity, 2026-11-10

- Claim: weekly npm downloads 2026-11-03 to 2026-11-09: promptfoo 1,246,072; autoevals 620,405; evalite 514,142;
  vitest-evals 242,687; deepeval 31,342. promptfoo on GitHub: 27,024 stars, 2,705 forks, 962 open issues, not
  archived, pushed 2026-11-09.
- Sources: https://api.npmjs.org/downloads/point/last-week/promptfoo (and the same for each package) ;
  https://api.github.com/repos/promptfoo/promptfoo
- Confidence: H.

## E20. Spike: promptfoo 0.125.1 with the Claude Agent SDK provider, 2026-11-10

- Claim: run as `npx -y -p promptfoo@0.125.1 -p @anthropic-ai/claude-agent-sdk@0.3.322 promptfoo eval -c <config>
  --output <file>.json --no-cache`, it ran a made-up skill with no `ANTHROPIC_API_KEY`, through the logged-in Claude
  Code session, when the provider sets `apiKeyRequired: false`. `evaluateOptions.repeat` repeats each case (a
  top-level `repeat` is ignored); each run is one `results.results[]` entry with `repeatIndex`, `testIdx`,
  `provider.label`, `success`, `cost`, `response.metadata.skillCalls` (empty when the skill did not fire), and
  `gradingResult.componentResults[]` with each assertion's `metric`. Two provider entries give the with-skill and
  without-skill arms. `setting_sources: [project]` with `skills: all` loads only skills in the run folder's
  `.claude/skills/`; a user-level skill did not fire. The provider in 0.125.1 has no `copy_working_dir` and deletes its
  temp folder, so a fresh copy of a case's files per run needs a wrapper provider that sets `working_dir`.
  24 runs on `claude-haiku-5-5` took about a minute and cost about $0.06.
- Source: a spike run in a scratch folder; provider options read from the installed package. Promptfoo docs:
  https://www.promptfoo.dev/docs/providers/claude-agent-sdk/
- Confidence: H for what ran; M that it holds for later promptfoo versions.

## E21. Loading a plugin from the working copy, 2026-11-11

- Claim: the Agent SDK's `plugins` option takes `{ type: 'local', path }` ("Currently only 'local' is supported") and
  passes one `--plugin-dir <path>` per plugin to Claude Code. promptfoo 0.125.1's `anthropic:claude-agent-sdk`
  provider passes its `plugins` config through, resolving each `path`; its `extra_args` refuses `--plugin-dir` as
  reserved, pointing to the structured option. A skill loaded this way is called as `<plugin>:<skill>`: with
  `claude -p --plugin-dir <folder>` (Claude Code 2.1.322), the Skill call's input was `{"skill":"spikeplug:hello"}` for
  a plugin named `spikeplug`.
- Source: `sdk.d.ts` of `@anthropic-ai/claude-agent-sdk` (`plugins`, `SdkPluginConfig`) and promptfoo 0.125.1
  `dist/src/claude-agent-sdk-*.js` (`plugins: config.plugins?.map(...)`, `RESERVED_POLICY_EXTRA_ARGS`), read from the
  installed packages; a spike run on `claude-haiku-5-5` in a scratch folder.
- Confidence: H for what ran on these versions; M that the call name keeps this form in later releases.
