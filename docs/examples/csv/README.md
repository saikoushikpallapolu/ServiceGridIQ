# Fictional CSV onboarding examples

Use **one stable source name**, for example `fictional-pilot`, and dry-run/commit these separately in order:

1. [customers.csv](customers.csv)
2. [sites.csv](sites.csv)
3. [equipment.csv](equipment.csv)
4. [jobs.csv](jobs.csv)

[parts.csv](parts.csv) is independent. All records are fictional. Job windows are deliberately in 2035; edit them before preparing an actual demo schedule. Imported jobs remain drafts and the examples do not create shifts, confirmations or assignments.

The [technicians.csv](technicians.csv) file is a header-only template. Add an external ID, an existing active technician membership ID without a profile, and a branch ID from the owner's reference-ID control. Empty templates cannot pass a dry run. Never add passwords, roles, skill verification or availability columns.

Files match the strict CSV field names. The owner can alternatively download templates in the app and map renamed source headers. Exports are review files with different columns and spreadsheet-safety transformations, not direct import templates. See the [walkthrough](../../operations/phase-7-local.md).
