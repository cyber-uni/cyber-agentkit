# Slugify — a title becomes a URL slug

## What

Authors publish posts whose URLs come from their titles. Without a rule, two tools make different URLs for one title.
Slugify turns a title into one slug every tool agrees on.

## Non-goals

- **N1.** Making slugs unique across posts.
- **N2.** Keeping non-Latin scripts readable in the slug.

## Key terms

- **K1. Slug.** Lowercase ASCII letters and digits, in words joined by single hyphens.

## Actors and goals

| ID | Actor | Goal |
| --- | --- | --- |
| A1.1 | Author | Gets a URL slug from a post title. |

## Use cases

### UC1 — Slug a title (A1.1)

- **Trigger:** the author publishes a post.
- **Entry points:** library: `slugify(title)` (primary).
- **Inputs:** the title.
- **Success:** the slug is returned.
- **Extensions:**
  - **UC1.1** The title is not a string: the call fails with a type error.
  - **UC1.2** The title has no letter or digit: the call fails with `empty-slug`.

## Criteria

- **R1.** (UC1) `slugify('Hello, World!')` returns `hello-world`.
- **R2.** (UC1) Accents are dropped: `slugify('Café Crème')` returns `cafe-creme`.
- **R3.** (UC1.1) A title that is not a string fails with a type error.
- **R4.** (UC1.2) A title with no letter or digit, such as `'!!!'`, fails with `empty-slug`.

## Open questions

None.

## References

- None.
