# Capability references: conclusion

## Last updated

November 2026

## Question

Should the reference system formalize a capability reference, a reference that describes what one system can do so a
skill can be generated or customized for it? What goes into one, what counts as a system, how does it stay current, and
how does it relate to interfaces?

## Verdict

Yes, as a named kind of interface implementation, not a new resolution mechanism. A capability reference is the
implementation, for one system, of an interface whose implementations are keyed by system (`many` cardinality). The
interface names the operations a skill performs; each capability reference says how that system does each one, or
that it cannot. Interfaces, keys, `check`, `implementations`, and the unsupported marker already exist (E9). Formalizing
adds what each author now invents again (E5): a shared preamble about the system itself, a partial level beside
supported and unsupported, a record of what the reference was verified against, and a probe.

- **Value over plain instructions in a skill:** a new system arrives as one file and the skill does not change (E4); a
  team patches one section for its own setup; `check` tells the author the reference covers what the skill expects;
  the skill learns what is unsupported before it tries (E2, E9).
- **Value over a link to the system's docs:** the docs are large and shaped around the system, not around the skill's
  operations. The reference holds the few commands the skill runs, and links to the docs for the rest, as llms.txt does
  (E16).
- **Generating a skill for a system** is a use of this, not a second kind: an author writing a skill for a new tracker
  writes a new capability reference for the existing interface. A description of a system with no interface to
  implement is a plain reference, and needs no formal kind (E12, E16).
- **"System"** stays broad: anything a skill operates through commands or an API, remote or on the machine (a tracker,
  a code host, a CLI tool). A harness is the exception in this repository, whose harness facts live in code with
  research citations.
- **Staying current:** hand-maintained descriptions rot (E14). Record the system versions each reference was verified
  against and how (run, or followed from docs), keep a doc link per section, and let the reference carry a probe that
  checks the system it is about.

## Reference material

| Field | Seen in | Proposed home |
| --- | --- | --- |
| System name, summary, doc link | MCP, llms.txt, BCD `mdn_url` | preamble section |
| Detect: is this the system in use | repobuddy `Detect` | preamble section |
| Versions and tiers covered; tool versions needed | repobuddy prose, OpenAPI `info.version` | preamble section |
| Verified against, and how | none (ours to define); repobuddy `*(untested)*` | preamble section |
| Support per operation: supported, partial, unsupported | BCD, Knex, Libcloud, repobuddy `**Unsupported.**` | each operation section |
| Since and deprecated versions per operation | LSP `@since`, BCD `version_added` | each operation section |
| Format version of the interface | OpenAPI `openapi`, Terraform `format_version` | the interface's `version` (exists) |

## Confidence

Medium-high. The "should exist" and "how it relates to interfaces" parts rest on code we own and read in full. The
staying-current part rests on one strong source (BCD) and thin vendor material.

## Strongest supporting evidence

- E4: repobuddy chose one shared name so a new tracker needs no change to the skills.
- E9: the reference system already holds every mechanism except the preamble and verification record.
- E5, E6: each author invents the preamble's facts again, and some leak into the skills.

## Strongest weakening evidence

- E3: the issue's own definition (authoring input) differs from the practice (runtime adapter). If the owner means the
  authoring form, the verdict narrows to "a plain reference with links".
- Only one interface of this kind exists today, so the shape is generalized from one example.

## Not supported

- That a "last verified" date keeps a description current on its own. No ecosystem found relies on one (E18).
- Runtime negotiation as a fit: it needs a live peer that declares its capabilities, which a CLI-driven tracker is not.

## Where evidence is thin

- How hand-written capability prose rots in practice (E18).
- Whether a probe can run in CI without credentials for the system.

## Check again later

- Once cyber-asana ships its tracker implementation, and once a second interface of this kind exists, whether the
  preamble holds for both.
