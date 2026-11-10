# Conclusion: what the `/skill test` default should build on

## Last updated

November 2026

## Question

`/skill test` runs trigger evals and outcome evals, several runs per case, judged pass or fail, scored as a pass rate against a threshold, isolated, saved, and compared to a baseline. cyber-agentkit ships the default Verification aspect. Which existing eval system can it build on so it does not write its own engine? It may use npm libraries, not agent-layer packages, and it must drive several harnesses.

## Verdict

1. **No system fits whole. The best base is promptfoo.** It is the only candidate that is an npm library, is actively released, runs agents through several harnesses (Claude Agent SDK, Codex SDK, OpenCode SDK, and any shell command), and has deterministic assertions, a binary-capable LLM rubric, repeats, a pass threshold, a skill-fired assertion, and file and JUnit output. Confidence: medium. Three needs are unverified for it: a pass rate across repeats, a with-skill versus without-skill baseline, and Cursor and Copilot CLI drivers (see `topic.md`).
2. **The runner-up is a thin runner owned by cyber-agentkit.** It copies the data model of `claude plugin eval`: one folder per case, one file per grader, a with arm and a without arm, three runs by default, and one versioned result JSON. It needs one small driver per harness. Pick it if a spike shows promptfoo cannot give a clean pass rate and baseline delta, or if its Node and size cost is not acceptable.
3. **Claude Code's own `claude plugin eval` is the best Claude driver, not the base.** It does everything asked, including a no-plugin baseline, OS sandbox, and CI exit codes. But it runs only Claude Code, is marked experimental in the manifest, and reads only a plugin. Use it as a design reference, and optionally as a backend for the Claude harness.
4. **Do not build on** evalite (archived, no longer maintained), OpenAI Evals (Python, dashboard now preferred), autoevals (scorers only, no runner), or DeepEval and Inspect AI as the default (Python first, no skill concept). Inspect AI with `inspect_swe` is the strongest sandboxed option for Claude Code, Codex CLI, and Gemini CLI, but it needs Python and Docker.

## Why promptfoo over the thin runner

- It removes the work that is not specific to skills: concurrency, retries, caching, the grader plumbing, and report formats.
- It already normalizes Skill tool calls into `metadata.skillCalls` for the Claude Agent SDK provider, which is the trigger eval signal. For Codex the same field is a guess from command text.
- The `exec:` provider is the escape hatch for any harness without an SDK.

## Why promptfoo might lose

- It now belongs to OpenAI. The repo says it stays MIT and open source.
- It needs Node 22.22 or newer, and cyber-agentkit declares `node >=22`, so adopting it raises that floor (or keeps promptfoo an optional dependency). It is also a large dependency. The Claude and Codex providers also need their own SDK packages installed.
- Its pass rate across repeats and its baseline comparison are not documented as features. cyber-agentkit would compute both from the result JSON, which is a thin layer of its own code.

## Shape of the decision for the Verification aspect

What the aspect's criteria judge is the saved result (per-run verdicts, pass rate, baseline delta), not the engine. So the default can start on promptfoo and change later without breaking the aced BDD override, as long as cyber-agentkit owns the result schema and maps the engine's output into it.

## Next step

Run a one-day spike, not part of this topic: one skill, one trigger case and one outcome case, promptfoo with the Claude Agent SDK provider, `repeat: 5`, two provider entries (with skill, without skill). Check that the JSON gives a per-case pass rate. Then decide between the base and the runner-up.

## Decision (2026-11-10)

The user chose to start the default on promptfoo, and to add `claude plugin eval` as the Claude backend once it is
available for this use (it is experimental and reads only plugins today). Both write into the one result shape that
cyber-agentkit owns.

## Sandboxing and popularity

promptfoo does not sandbox runs itself. Isolation comes from the driver: the Claude Agent SDK provider copies the
working directory per case and takes a `sandbox` block and tool allow and deny lists; the Codex SDK provider has a
filesystem `sandbox_mode` with network set apart; `exec:` has none. A case whose outside effect cannot be contained
must therefore not be run. promptfoo had about 1.25 million npm downloads in the week of 2026-11-03 and about 27,000
GitHub stars.
