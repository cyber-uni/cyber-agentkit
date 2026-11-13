---
name: skillify
description: Turn work already done into a skill, as in "turn what we just did into a skill", "skillify this session", "make a skill from these notes", "make a skill out of how I did this last week", or "turn this other skill into one for our repo".
argument-hint: "[sources: a document, another skill, or past sessions; default this session]"
---

# Skillify

Write a description of a skill from work already done, then run `/skill create` on it. The sources show what was
done, not what the skill should do: the author decides that when `create` asks them to approve the Intent.

## 1. Read the sources

1. The sources are what the prompt names: a document, another skill, or past sessions, such as "the sessions of the
   last week". With no prompt, the source is this session's work. The prompt can also say which job in the sources to
   capture.
2. If a named source cannot be read, stop and name it. If this session holds no work and the prompt names no other
   source, say there is nothing to skillify, point to `/skill create`, and write nothing.
3. Never change a source.

## 2. Find the job

1. One source holding more than one job, with the prompt naming none: propose one skill per job, and build none until
   the author picks.
2. Several sources not sharing one job: propose one skill per job found in more than one source, name the jobs found
   in only one, and build none until the author picks.
3. Otherwise the job is the one the sources share.

## 3. Decide what varies

- **Several sources:** the steps every source shares are the skill's steps. Each value that differs between them,
  such as the repository, the version, or the target, is an input.
- **One source:** propose what would differ on the next run, and make each of those an input.

## 4. Write the description

Answer each question `create` asks the author, from the sources, generalized over step 3:

- **Job and result:** the job the sources did and the result it handed back.
- **Corrections:** what the author corrected or rejected, and the checks the sources ran on the result.
- **Fixed steps:** the steps done the same way every time.
- **Asking words:** the words the author used to ask for the job.
- **Cases:** the requests and inputs a case could use, rewritten as made-up cases of the same shape.
- **Generalizes over:** the inputs step 3 found.

After each answer, name the part of the source it came from, such as a section of a document or a turn of a session.
Leave out an answer the sources do not hold: `create` asks the author for it.

Check each fact a source states about the repository, such as a path, a file count, or a command, against the
repository now. Where it no longer holds, use what holds now and name the difference.

## 5. Run create

Run `/skill create` (the `skill` skill of `cyber-agentkit`) with the description as its argument, at once, without
asking the author first. `create` acts at its own autonomy level; this skill has none.

## Done when

Before reporting done, check each of these against the result. Report any that fails.

- **C1.** No source changed.
- **C2.** `/skill create` ran with the description, and nothing asked the author before it.
- **C3.** The description states the job and its result, the corrections, the fixed steps, and the asking words, for
  each of them the sources hold.
- **C4.** Each answer in the description names the part of a source it came from.
- **C5.** The description states what the skill generalizes over; with several sources, its steps are those every
  source shares, and each value that differs is named as an input.
- **C6.** Each fact a source states about the repository that no longer holds is replaced by what holds now, with the
  difference named.
- **C7.** A source that could not be read, a session with nothing to skillify, or sources holding more than one job
  ended without running `create` or writing a file, and said why.
