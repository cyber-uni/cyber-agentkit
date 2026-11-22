---
description: How a tracker's operations are done on one system, one way.
interface:
  cardinality: many
  version: 1
  sections:
    - {heading: Create, required: true, holds: How an item is created.}
    - {heading: Link, holds: How two items are linked.}
---

## Item ref

Every operation that returns an item gives the skill its id and URL.
