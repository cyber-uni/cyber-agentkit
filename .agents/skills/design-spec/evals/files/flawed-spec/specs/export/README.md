# Export — export reports and email them

## What

The export module uses the CsvWriter class to write reports, then emails them.

## Non-goals

- Must not crash.

## Use cases

### UC1 — Export a report

- **Trigger:** the user clicks Export.
- **Success:** a file is written.

## Criteria

- Export is fast.
- The CsvWriter flushes after every row.
- Emailing works appropriately. TBD which mail host.

## Open questions

## References
