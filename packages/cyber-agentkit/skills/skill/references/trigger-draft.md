# Trigger draft

The Draft of the Trigger aspect in `SKILL.md`: how `create`, `fix`, and `enhance` write a skill's `description` and its
near misses.

Open with a sentence of at most 100 characters stating the main thing the skill does: a slash-command menu shows only
the start. Then name the job in the words users type, with two or three phrasings. Use no lead-in such as "Use this
skill when" and no filler words. Say nothing about when not to use it. List three or more near misses: requests a user
could plausibly make that belong to the nearest other jobs. Take only a near miss the description itself rules out, by
stating precisely what the skill does. A near miss rejected only because another skill takes it cannot be tested, since
a test loads a fixed set of skills and a real install may hold any, unless that skill ships in the same plugin: it is
always installed beside this one, and the test loads it. Two kinds of skill are exempt from this: a name-only skill,
whose description is a fixed marker (see Name-only skill under `SKILL.md`'s Trigger), and a user-only skill, which stays
user-invocable but turns model invocation off (in Claude Code, `disable-model-invocation: true`).
