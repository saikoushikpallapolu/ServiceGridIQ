# Phase 6: technician visits and linked follow-ups

This phase completes the local core workflow: intake → preparation → approved assignment → technician acknowledgment/start → observations → closure/follow-up. CSV onboarding/reporting remain Phase 7; hosted deployment, recovery, monitoring and controlled-pilot safeguards remain Phase 8. AWS is still explicitly deferred. See the [API contract](../api/phase-6-openapi.json).

## Assignment-scoped technician access

Technicians receive a separate My service visits workspace. Lists and details are scoped to the active company, their current active TECHNICIAN membership/profile and the assigned technician ID. They cannot use the company-wide intake, workforce or parts APIs.

Active visits are ASSIGNED, ACKNOWLEDGED or IN_PROGRESS. Historical access is limited to the technician's own closed visit or terminal cancelled assignment. Rescheduling revokes access to the withdrawn assignment; a former technician cannot use that ID to keep viewing a job later reassigned to someone else. Role/profile/membership revocation is rechecked on each request and inside mutation transactions.

Cards show the authorized customer/site/equipment context, planned reservation, actual timestamps, original approved preparation snapshot and separately labelled current evidence freshness. Only selected business DTO fields are returned, not identity-provider subject/issuer records. Evidence expiry does not rewrite the original approval.

## Lifecycle

| Action | Actor | Required state | Atomic result |
| --- | --- | --- | --- |
| Acknowledge | Assigned technician | ASSIGNED, current active assignment | ACKNOWLEDGED, actual acknowledgment timestamp, event/audit/outbox |
| Start | Assigned technician | ACKNOWLEDGED; current qualifications and no safety restriction; no other in-progress visit | IN_PROGRESS, server actual start, event/audit/outbox |
| Observe | Assigned technician or dispatcher/owner | IN_PROGRESS | Append note, reported usage or correction; increment job version and audit |
| Close | Assigned technician or dispatcher/owner | IN_PROGRESS | CLOSED; one closure; release assignment/time; record actual end and outcome; optionally create one linked follow-up draft |
| Reschedule | Dispatcher/owner | ASSIGNED or ACKNOWLEDGED | Release assignment/time; new window/estimates; TRIAGED; clear review/ready/warnings; increment visit revision |
| Cancel | Dispatcher/owner | DRAFT, TRIAGED, READY, ASSIGNED or ACKNOWLEDGED | Terminal CANCELLED; reason; release active assignment/time |
| Annotate | Closing technician or dispatcher/owner | CLOSED, bound closing assignment | Append a note/correction only; never change the stored outcome |

All mutations require exact job version, a bound assignment ID (null for unassigned cancellation), exact-origin CSRF and an idempotency key. Owners do not impersonate a technician's acknowledgment/start. In-progress visits cannot be cancelled or rescheduled; close unresolved and schedule the linked follow-up instead.

Actual timestamps use server time. Starting early is allowed and does not move the approved planned reservation. One active in-progress visit per technician is enforced both transactionally and by a partial unique index, even when two planned appointments do not overlap. Real-time delay prediction, automatic extension of reservations and route/overrun alerting are not provided. Dispatchers must review delays; planned reservations are not silently rewritten.

## Append-only observations and usage

Observations retain actor, assignment and monotonically increasing recorded job version. A correction references an existing record in the same company/job/assignment and leaves the original intact. The UI shows the newest 200 records in recording order; complete history remains in PostgreSQL.

Reported parts usage requires a positive decimal quantity and either a part already in the visit context or an explicit free-text label for an unexpected part. It does not change balances, reserve/consume stock or create a catalog item. New usage cannot be added after closure; corrections or notes can annotate a closed visit without changing its outcome.

## Follow-up creation

Resolved closure requires notes and no follow-up fields. Unresolved closure requires notes, a reason (PARTS, SKILLS, INFORMATION, ACCESS, NEW_FAULT, CUSTOMER_REQUEST or OTHER) and a valid future customer arrival window. These are recorded classifications, not automatically proven causes.

In the same transaction, the server closes the visit, releases its reservation, and creates exactly one FOLLOW_UP draft with parent_job_id pointing to the closed visit and root_job_id preserved across the chain. It copies customer/site/equipment, complaint/category/priority, estimates, branch/skill policy and part/prerequisite definitions. It never copies assignments, confirmations, prerequisite evidence, review flags, warnings or ready approval. The follow-up must be triaged, prepared and assigned separately.

Unique parent and closure constraints protect duplicate creation. Tenant-safe self-references and shape checks prevent cross-company/self references; public intake cannot write parent/root/type fields. The closed original is never reopened. Resolved assignments now populate resolved_at so the Phase 5 familiarity feature can count real recorded resolved visits.

## Transactions, retries and release

Write authorization is centralized: company lock → current role/access check → job lock → technician lock. State and assignment activity are checked again inside that transaction. Release updates assignment and reservation together; rescheduling invalidates old visit-revision evidence, even if the visit later moves back to its earlier time.

Successful mutation results are recorded in the existing company/actor-scoped idempotency table with operation, job and full payload hash. Identical retries do not add observations, events, closures or follow-ups twice. Keys reused for another action/payload are rejected. Current authorization is checked before replay, so withdrawn/revoked access does not regain data through an old key. Events, audit and applicable pending outbox records commit with the mutation. Outbox delivery is still not configured.

## UI recovery and scope limits

Visit forms keep their inputs on failed requests and retain the same action key/payload for retry. Browser tests drop a committed closure response and verify safe retry. Technician/dispatcher visit forms and intake edits register unsaved-change warnings for workspace/sign-out/navigation and browser unload. Explicit discard/reload is required before replacing these forms. Manager forms retain their observed version/assignment binding if another operation changes the job, so a stale form cannot silently act on a replacement assignment.

The app is online-only. It has no offline queue, background sync or durable browser draft store. Catalog/workforce administration forms are not part of the visit unsaved-draft workflow. Unassigned follow-up drafts are visible to dispatchers, not technicians until approval. Legacy inactive assignments without Phase 6 release metadata are not automatically treated as historical authorization.

The sixth migration is additive and transactional. Tests cover access boundaries, action ordering, revoked/stale assignments, duplicate responses, concurrent start/close, immutable closure, corrections, release, fresh follow-up preparation and multi-level root linkage. See the [completion checklist](../plans/phase-6-checklist.md).
