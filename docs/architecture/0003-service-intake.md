# Phase 3: service intake

This phase builds local customer-to-job intake on the audited Phase 2 authentication foundation. AWS staging and production identity remain explicitly deferred. See the [implemented contract](../api/phase-3-openapi.json).

## Records and authorization

- Owners and dispatchers can create, list and edit customers, service sites and equipment in their active company. Technicians cannot access these endpoints or the intake queue; assignment-scoped access is a later phase.
- A customer has a name and optional email/phone. A service site belongs to one customer and contains an address and access notes. Equipment belongs to one site and contains manufacturer, model, serial number and notes.
- Composite foreign keys enforce the company/customer/site/equipment chain, including for direct SQL writes. IDs and organization headers supplied by a browser never determine authorization independently of the session.
- Site ownership and equipment location are immutable in this phase. There is no delete operation. Explicit relocation, archival and historical snapshots require later design; current job details show the latest master-record values.
- Mutations require exact-origin CSRF checks. Within a transaction, the service locks the company and rechecks current membership, user and company status before writing. This uses the same lock as owner role changes. Company-level serialization is deliberately simple for the local pilot; measure contention before scaling it.
- Phase 3 initially used a shared observed-IP workspace rate limit. Phase 4 replaces it with verified-user buckets and a separate IP ceiling; see [the current scheduling decision](0004-scheduling-foundation.md). Trusted-proxy configuration and distributed limits still require hosted-deployment review.

## Intake semantics

Each job requires a matching customer, site and equipment, a complaint, priority, an arrival window, estimated work duration and travel buffer. Priority is LOW, NORMAL, HIGH or URGENT; it does not yet assign, rank or reserve anything.

Arrival start and end are timestamped instants with explicit offsets. The browser labels and converts its local time zone; PostgreSQL stores timestamptz. End must follow start and be within seven days. Historical windows are allowed for onboarding existing records. Work duration is 15–1440 minutes and travel buffer is 0–480 minutes. These are independent estimates: work may extend beyond an arrival window. There is no technician appointment, travel calculation or availability promise yet.

## State transitions

| Action | Allowed role | Prerequisites | Atomic effects |
| --- | --- | --- | --- |
| Create | Owner or dispatcher | Valid complete intake and same-company references | DRAFT v1; timeline and audit entry |
| Edit intake | Owner or dispatcher | DRAFT; exact version; valid fields and references | Increment version; timeline with changed field names; audit |
| DRAFT → TRIAGED | Owner or dispatcher | Exact version; valid references and arrival window | Increment version; timeline and audit |
| TRIAGED → DRAFT | Owner or dispatcher | Exact version; nonblank correction reason | Increment version; reason recorded in timeline; audit |

Other transitions, same-state requests, editing triaged intake, and stale writes are rejected. TRIAGED means intake is checked and ready for the future scheduling workflow. It does not imply readiness, stock availability or assignment.

## Concurrent edits and history

Jobs and master records have positive integer versions. Every edit submits its observed version. Only one of two simultaneous updates can commit; the loser receives HTTP 409. A job transition also checks the version. The UI keeps a rejected job form and offers explicit reloading; it never retries over another dispatcher's changes silently.

Timeline entries and audit records commit in the same transaction as the job change. The UI shows the newest 100 timeline events with actor and time, and the newest 20 other requests for that equipment. These are service requests, not evidence of completed visits. Earlier records remain in PostgreSQL. The owner audit view retains its existing newest-100 limit. No retention/cleanup job or complete historical export is delivered here.

The queue offers complaint/customer/serial search, exact status and priority filters, and bounded offset pagination with timestamp/ID ordering. Master pickers fetch paginated customer and parent-filtered site/equipment lists. This supports the local pilot; server-side searchable pickers and keyset pagination should replace full picker loading for larger datasets. Offset pages may shift as other users insert new jobs.

## Verification boundary

The new integration tests exercise authorization, tenant-safe references, validation, direct database constraints, master-record versions, stale transitions, simultaneous job edits and transactional audit/timeline behavior. Browser tests exercise the full dispatcher workflow, stale-form recovery, mobile layout and company switching. Existing authentication regression tests remain in CI. This is local application verification, not a production security assessment.
