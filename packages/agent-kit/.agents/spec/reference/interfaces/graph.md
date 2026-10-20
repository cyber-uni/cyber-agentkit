# reference/interfaces — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## Checking interfaces

```mermaid
flowchart TD
  k([check name]) --> kind{"E35 an interface, an implementation, or neither?"}
  kind -->|neither| kf([failure, exit 1])
  kind -->|interface| shape{"E52 the interface block well formed?"}
  shape -->|no| kf
  shape -->|yes| comp
  kind -->|implementation| found{"implements one id@version naming a found, valid interface?"}
  found -->|no| kf
  found -->|yes| checks["version, name, order on the composed document"]
  checks --> sections["E36 sections open and optional; a listed one left out or Unsupported is listed unsupported"]
  sections --> comp{"compose: did composing raise a warning?"}
  comp -->|yes| kf
  comp -->|no| ok{any other check failed?}
  ok -->|yes| kf
  ok -->|no| kp([pass, exit 0])
  i([implementations id]) --> pass{"E37 passes check for that interface?"}
  pass -->|yes| listed["listed: pin, description, unsupported"]
  pass -->|no| excl[excluded, each with its reasons]
```

| Edge | Decision | Outcome |
| --- | --- | --- |
| E38 | `check` with no names | every interface document and implementation; a name several plugins hold also as each `<plugin>/<name>`; each skill's default as its skill loads it |
| E39 | `show` of a document failing its interface | printed, with a warning naming the check |
