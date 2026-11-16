# Phase 7: reviewed onboarding and descriptive reporting

The local pilot now has owner-only CSV onboarding, exports, operational reports and attributed audit history. This refines the v2 blueprint's proposed import/export interfaces. The [implemented API contract](../api/phase-7-openapi.json) and this decision describe actual behavior. AWS and the Phase 8 operational deployment gate remain deferred. Live vendor adapters, historical outcome import and stock accounting are not included.

## Authorization and atomicity

Every Phase 7 endpoint requires the active company's current OWNER membership. Dispatchers and technicians cannot use imports, exports, organization reports or audit history. Mutations additionally require exact-origin CSRF. Large JSON uploads are parsed only after session, rate, tenant, owner and CSRF checks; ordinary requests retain the existing 32 KiB parser limit. Nginx and the authenticated upload route allow an 8 MiB JSON envelope around a maximum 5 MiB CSV file.

Dry runs and commits acquire the same company lock as membership changes and operational writes, and recheck active user/membership/company authorization under that lock. Commits revalidate the complete dataset and write records, external mappings, imported-job events, provenance and idempotency results in one transaction. Bulk inserts support up to 2,000 rows; the transaction timeout is 60 seconds. A failed transaction rolls everything back. Ordinary operations retain their existing transaction defaults.

## CSV format and ownership

The six datasets are customers, sites, equipment/assets, technician profiles, draft jobs and the parts catalog. They use strict downloadable templates; all columns must exist, with optional values blank. UTF-8, a BOM, CRLF/LF, doubled quotes, embedded commas and quoted newlines are supported. Invalid UTF-8, NUL, malformed quotes, duplicate/empty headers, unsupported columns, duplicate external IDs and invalid field/reference chains are rejected. Limits: 5 MiB, 2,000 nonblank data records, 40 columns and 8,000 characters per field, plus tighter domain field limits. Errors identify logical CSV record number (header is 1; blank records excluded; a quoted multiline value remains one record), field, code and message. The first 200 errors are shown alongside the full error count.

Optional mapping maps expected template field names to source header names. It must be one-to-one and cover the exact template fields; no expressions or executable mappings. External identifiers and source names are case-sensitive. The immutable reviewed file fingerprint is SHA-256 over original uploaded bytes, including any BOM. Normalized parsed field values get a separate content hash for repeat detection.

`external_records` has a unique company/source/dataset/external-ID key. New keys create records. Repeating identical source data skips its mapped record, preserving subsequent manual application edits. Changed source data produces a conflict for manual review; CSV never overwrites live state or silently merges names. Switching source names creates a different namespace and can create duplicates, so keep one stable name per source. Generic mapping targets are resolved through tenant-filtered domain tables; database uniqueness and tenant-scoped foreign keys protect concrete parent chains.

Import customers, then sites, then equipment, then jobs using the same source. Each dataset commits separately; a batch cannot mix types. Customer/site/equipment references must already be imported in that source namespace. These interfaces do not bind arbitrary pre-existing native records to new external IDs. Existing operational records remain editable through their ordinary versioned workflows.

Technician imports require an existing active TECHNICIAN membership and company branch, with no existing profile. Owners invite people first and can load reference IDs in the import screen. Imported profiles contain no verified skills or shifts; use the existing qualification/availability workflow afterward. CSV cannot create identities, assign roles, verify skill claims or book time.

Imported jobs are INITIAL/DRAFT, with no assigned technician, linked parent, approval or outcome. This first adapter requires equipment and serial numbers consistently with the implemented intake contract; the blueprint's optional-asset suggestion is not implemented. Parts imports create catalog entries only; stock snapshots and job-specific confirmations are not imported. Review required parts and manual evidence through preparation after onboarding.

## Review, retry and retention

A dry run stores the immutable source CSV, header mapping, creator, source/dataset, hash, validation summary and 24-hour expiry in PostgreSQL. Only its creating owner in the same company can load the metadata or commit. Raw contents are not returned by the API or written to application logs. Review and commit are separate buttons. Keep the batch ID to recover a review after browser shutdown; the UI does not persist files or drafts in local storage.

Commit references only the batch ID and reviewed hash, with an idempotency key. All references, membership eligibility, collisions and content hashes are checked again. A changed reference returns `committed: false` and an updated invalid review with zero imported writes. Correct the file and create a new dry run. Successful retries return the saved result; committed batches cannot apply twice even if the browser loses its action key. Current company/owner/creator authorization is still required before replay. Cross-operation/payload/actor key reuse is rejected.

Raw contents become unusable at expiry. The API process clears expired payloads on startup and every 15 minutes; dry-run requests also trigger cleanup. Metadata and validation remain for provenance. If the API is stopped, physical cleanup resumes on startup; expiry still prevents commits. Backups have their own retention requirements to define in Phase 8. The initial database retention mechanism supersedes the proposed object-store upload: no S3 bucket, public URL or background Redis queue is needed for these bounded batches.

## Exports and audit

An owner requests a CSRF-protected CSV attachment directly through an authenticated response. There is no public download URL or saved export object. Exports use explicit field allowlists, company scope, ID ordering and up to 2,000 records per page. The UI uses 1,000/page and reports total records. Each page is its own snapshot; concurrent insertions/deletions can shift offset pages, so export during a quiet period. Export files include internal IDs and source/external references; they are review files, not round-trip import templates.

Cells are quoted, quotes doubled, UTF-8 BOM/CRLF used, and formula-leading values (including whitespace/control prefixes) get a leading apostrophe. This intentionally changes display data such as phone numbers beginning with `+`; document the transformation before downstream reuse. Each successful page request records actor, dataset, pagination and row count in audit. Identity-provider issuer/subject, credentials and raw uploaded CSV are never exported.

The owner's audit screen supports action filtering, pagination and attributed details. The API additionally supports UTC from/to filters. Actor names reflect the current business user record, with the immutable actor membership ID retained internally. The existing compact recent-activity panel remains available.

## Reporting definitions and limits

Reports take a UTC `[from,to)` arrival-start range of at most 366 days and 10,000 jobs, read in one repeatable database snapshot with server-generated `asOf`. They do not run historical as-of reconstruction; the data is its current recorded state.

- Cohort: INITIAL jobs in the arrival-date range. Explicit manual exclusions and cancellations are removed separately, without double counting. Managers must flag agreed planned multi-visit work; it cannot be inferred from a complaint automatically.
- Maturity: 14 days after the later of planned arrival-window end and recorded closure. This conservatively prevents a newly closed old appointment from appearing immediately mature. Open jobs past the window remain missing outcomes.
- First-visit completion: mature initial jobs with a recorded RESOLVED closure and no linked follow-up within the observation window, divided by all eligible mature initial jobs. Missing outcomes remain in the denominator and are shown explicitly.
- Linked follow-up rate: mature initial jobs with a linked child created within that window, divided by the same denominator. Reasons and service categories use this same mature initial cohort. The result measures recorded links, not proven preventable revisits; unlinked returns and incorrect classifications can undercount.
- Preparation elapsed: mean and median creation-to-first-approval for all approved jobs in the arrival-date range, including follow-ups and jobs outside the outcome cohort. One job contributes once even after rescheduling. This includes customer waiting and is not active dispatcher labor.
- Current readiness gaps: evaluate up to 200 unassigned DRAFT/TRIAGED/READY, non-manually-excluded jobs in stable ID order. Report the number checked and not checked. Each job counts once per gap category/severity; part/prerequisite IDs aggregate into categories. This is a current operational snapshot, not historical prevalence or a representative random sample.

Empty cohorts return null rates rather than misleading zero percentages. UI discloses denominators, missing data, exclusions, waiting cohorts, snapshot date, readiness sampling and elapsed-time interpretation. Reports make no causal or customer-benefit claims.

Reporting exclusions are owner-reviewed `PLANNED_MULTI_VISIT` or `DATA_QUALITY` decisions with a note and separate optimistic version. A null reason restores inclusion. Each change is audited; it does not change operational job version, lifecycle, approval or evidence freshness.

See the [walkthrough](../operations/phase-7-local.md) and [verification checklist](../plans/phase-7-checklist.md).
