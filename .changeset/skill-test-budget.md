---
"cyber-agentkit": minor
---

`/skill` behaves the same in every run, whoever is or is not watching: it no longer guesses whether an author is present. The leash in `skill-design.autonomy` decides where a run stops: each command's level (`apply` for `create`, `apply-safe` for `fix`, `ask` for `enhance` by default) and a new test budget, `$10 or 60 runs` by default. `skill test --estimate` prices a test from its last saved result, or at $0.18 a run with none, and a test within the budget runs without asking. A test over the budget, or a decision only the author can make, stops the run the same way every time: the work so far is kept and reported, and the reply ends with the question and its options.
