# Topic: existing eval systems for `/skill test`

## Question

Which existing eval system can be the default behind the `test` command of `/skill`, so cyber-agentkit does not write its own eval engine? See `conclusion.md` for the answer and `evidence.md` for sources (claims are cited as E-numbers).

## Requirements used as the yardstick

R1 npm-friendly: an npm dependency, a subprocess, or nothing. No agent-layer package.
R2 Drives several harnesses, not only Claude.
R3 Trigger evals (did the skill fire) and outcome evals (output against a rubric).
R4 Binary judge per run (pass or fail), not a 1-5 scale.
R5 Deterministic assertions.
R6 Repeated runs and a pass rate against a threshold.
R7 Isolation: no real side effects.
R8 Saved results (transcripts, outputs, scores) that later commands can read.
R9 Baseline comparison (no skill, or previous version).
R10 CI use.

## Comparison table

Dates are as read on 2026-11-10. "U" means unverified.

| System | Language and dependency | License | Maintenance | Harnesses it can drive | Binary judge | Deterministic assertions | Repeats and pass rate | Sandbox | Results and baseline | CI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| promptfoo | TypeScript. npm library (`promptfoo.evaluate`) or CLI. Node 22.22+ | MIT | Release 0.125.1 on 2026-10-25, pushed 2026-11-09. Now part of OpenAI | Claude Agent SDK, Codex SDK, Codex app server, OpenCode SDK, `exec:` any command. Copilot, Cursor, Gemini CLI not listed | `llm-rubric` returns `pass`, `score`, `reason`. Binary use works through `pass` | Yes (javascript, contains, skill-used and more) | `repeat` option, test `threshold`. Pass rate across repeats: U | Claude SDK: `sandbox`, `copy_working_dir`. Codex: `sandbox_mode` | Output as json, jsonl, csv, html, junit.xml, plus a local store. Baseline: no dedicated feature. Two provider entries is an inference (U) | Yes |
| claude plugin eval | Claude Code CLI. Subprocess | Part of Claude Code (proprietary) | Shipped in v2.1.269. Marked experimental in the manifest | Claude Code only | `llm` grader: pass if 2 of 3 judge votes pass | `regex`, `tool_used`, `tool_order`, `file_exists` | 3 runs per case by default. Case score is the mean. `--threshold`, default 1.0 | Fresh temp home and workspace, OS sandbox when Bash is granted, no network outside shell | `aggregate-result.json` (schemaVersion 1) and `report.html`. No-plugin baseline arm with Delta. No previous-version arm | Yes, `--json`, exit code 1 below threshold |
| skill-creator (anthropics/skills) | Python scripts plus agent prompts. Subprocess, or copy the ideas | Apache 2.0 (LICENSE file) | Folder last changed 2026-04-20. Repo active | Claude Code only (`claude -p`) | Grader subagent, expectations with `passed` and `evidence` | Scripts, per author | Trigger eval runs each query 3 times. Benchmark aggregates mean and stddev | None of its own. Uses subagents | Per-run folders with `grading.json`, `benchmark.json`. Baseline `without_skill` or `old_skill` | Not described. Needs an interactive session |
| Inspect AI (+ inspect_swe) | Python. Subprocess only | MIT | 0.3.288 on 2026-11-07 | Claude Code, Codex CLI, Gemini CLI, Kimi Code, OpenCode, Mini SWE Agent via inspect_swe | `model_graded_qa` and `model_graded_fact`. Scale: U | Many built-in scorers | `--epochs` with reducers (mean, pass_at_k, at_least_n and more) | Docker built in, k8s and others external. Network off in Docker | Log files (`eval` or `json`) and a viewer. Baseline: manual | Yes (CLI) |
| DeepEval | Python, and a TypeScript package for Vitest | Apache 2.0 (GitHub) | python-v4.2.4 on 2026-09-22 | Frameworks (LangChain, OpenAI Agents and more). No Claude Code or Codex driver found | G-Eval with a 0-1 score and threshold | Yes, in the pytest style | Repeats: U | U | Local cache, JSON folder, SQLite, or Confident AI cloud | Yes (pytest) |
| vitest-evals (getsentry) | TypeScript. npm, Vitest 5 plugin | Apache 2.0 | v0.18.1 on 2026-11-07 | Harness packages for AI SDK, OpenAI Agents, pi-ai. Custom harness possible. No CLI-agent harness | Judges with score and `judgeThreshold` | Tool assertions, custom | Pass rate gate in the GitHub action (`min-pass-rate`). Repeats per case: U | None | JSON report, local report UI. Baseline: none | Yes (GitHub Actions) |
| evalite | TypeScript, Vitest-based | MIT | Archived and deprecated. Last release 0.19.0 on 2025-11-06 | AI SDK style tasks | Scorers (score) | Yes | `trialCount` | None | Local store and UI | n/a |
| autoevals (Braintrust) | TypeScript and Python. npm library | MIT | 0.4.1 on 2026-10-21 | None. Scorers only, no runner | LLM classifier scorers (Factuality and others) | Some | None | None | None | n/a |
| OpenAI Evals | Python | MIT (page), NOASSERTION (GitHub API) | Last push 2026-04-14. Banner points to the OpenAI Dashboard | Completion functions. No CLI-agent driver found | Model-graded YAML | Basic templates | U | None | Local record files | U |

## Findings by candidate

### promptfoo

- It runs as an npm library or CLI. The library call is `promptfoo.evaluate(testSuite, options)` and returns a summary with `results`, `success`, `score`, and `stats` (E2, E3).
- The Claude Agent SDK provider runs the agent with an isolated or copied working directory, a `sandbox` block, tool allow and deny lists, and a `skills` filter. It reports `metadata.toolCalls` and `metadata.skillCalls`, and supports a `skill-used` assertion (E4).
- The Codex SDK provider runs one ephemeral thread per case, has a filesystem `sandbox_mode`, and reports skill use only as a heuristic from command text (E5).
- `exec:` runs any shell command and takes stdout as the output, so any harness with a headless CLI can be driven, with no tool-call metadata (E6).
- `llm-rubric` asks the judge for a JSON object with `reason`, `score` and `pass`. Without a threshold, `pass` decides (E7). That gives a binary verdict per run.
- `repeat` runs each case N times. A test `threshold` sets the pass bar on the combined assertion score (E8). A pass rate over the N repeats would be computed from the result rows. That is untested.
- Result files can be json, jsonl, csv, html and junit.xml (E8). Functions passed as transforms are not saved to the store (E3).
- Cost: Node 22.22 or newer, and the agent SDK packages installed beside it (E3, E5).

### claude plugin eval

- Each case is a prompt file plus grader files. Six grader types. Three runs per case. Case passes at `--threshold` (E9).
- A no-plugin arm gives a Delta. Graders such as "Skill was invoked" are not scored in the without arm (E9).
- Runs happen in a fresh temp home and workspace as a `claude -p` child. Bash runs under the OS sandbox. Scaffold scripts and real MCP servers run outside the sandbox. Mocks for MCP tools are supported (E9).
- It reads only a plugin directory or an installed plugin. Its case files are not the same format as skill-creator (E9).
- It is Claude Code only, so it cannot be the cross-harness default (E9).

### skill-creator

- Trigger eval: writes a temporary command file, runs `claude -p` with stream-json, and detects the skill from stream events. Each query runs 3 times and the description loop splits 60 percent train and 40 percent test (E10).
- Outcome eval: with-skill and baseline subagents, a grader subagent writing `grading.json`, an aggregate script producing `benchmark.json` with mean, stddev and delta (E10).
- It is written for an agent to drive, not for CI. Claude only (E10).

### Inspect AI

- Strongest isolation story: Docker sandboxes with network off, epochs with reducers, a log format and viewer (E11, E12).
- inspect_swe wraps Claude Code, Codex CLI, Gemini CLI and more as Inspect agents inside the sandbox (E13).
- Python and Docker make it a poor default for an npm package. It stays a good optional backend for strict isolation.

### Others

- evalite is archived by its author (E14).
- autoevals is a scorer library only (E15).
- vitest-evals is a TypeScript harness layer with a good GitHub reporter, but its harnesses target AI SDK style apps, not CLI agents (E16).
- DeepEval has a TypeScript package and G-Eval thresholds, but its agent support is framework-based (E17).
- OpenAI Evals is a Python benchmark framework and its README points users to the Dashboard (E18).

## Open points

- U1 Does promptfoo give a per-case pass rate over repeats without custom code?
- U2 Can one promptfoo run hold a with-skill and a without-skill provider and compare them?
- U3 Which Node versions does cyber-agentkit support? promptfoo needs 22.22 or newer.
- U4 Cursor and Copilot CLI headless drivers: none found in promptfoo. They would go through `exec:`.
- U5 Whether `claude plugin eval` leaves experimental status.
