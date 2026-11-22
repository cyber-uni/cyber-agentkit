---
title: Cross-referencing documents
description: What is known about how agents read documents that point at each other, and what that means for an author of skills, references, and specs.
---

Skills, references, specs, and instructions often point at one another. A skill names a reference to load, a spec
names the spec it builds on, and two documents can each say what the other is not. This page states what is known
about the cost of those links for an agent that reads them, for an author deciding how to write them.

## A document that needs another has a measured cost

When a document cannot be understood without another, the agent must gather facts from both. Research on
multi-document reasoning shows that accuracy drops as the facts a task needs spread over more places, and drops
again with each hop from one document to the next. Anthropic also reports that Claude reads a file referenced from a
referenced file only in part, and advises keeping references one level deep.

So keep each document readable on its own where you can. When one must depend on another, keep the chain short.

## A cycle has no measured extra cost

A cycle is two documents that each need the other to be understood. No paper, benchmark, issue, or incident found
measures that case. Nothing shows that a cycle costs more than two one-way dependencies. Its cost is the cost of the
two dependencies it is made of.

## The loops seen in practice come from skills invoking each other

The agent loops that have been observed are not reading loops. They happen when a skill invokes itself, or two skills
invoke each other, at run time: one reproduced case spawned about a hundred subagents in minutes. A skill that can
invoke another skill which can lead back to it needs a termination guard, such as a depth limit or a condition that
stops the next call.

## Two-sided references are untested

A pair of self-contained documents that each mark the boundary with the other, such as "A is not B" and "B is not
A", has no evidence for or against it. Each document still reads on its own, so it carries no comprehension
dependency.

## Sources

The research behind this page, with its evidence and confidence, is in
[circular-spec-references](https://github.com/cyber-uni/cyber-agentkit/blob/main/.research/circular-spec-references/conclusion.md).
