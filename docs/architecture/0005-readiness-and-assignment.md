# Phase 5: readiness and approved assignment

AWS remains explicitly deferred. This phase completes the local dispatcher preparation-to-assignment workflow. See the [implemented API](../api/phase-5-openapi.json) and [walkthrough](../operations/phase-5-local.md).

## Records and evidence

- Owners and dispatchers create catalog parts with a company-unique uppercase SKU, name and unit, and BRANCH/VAN stock locations linked to a company branch. There are no stock balances, inventory movements, parts reservations or consumption endpoints.
- A job part specifies a catalog part, one location, a positive decimal quantity with at most three fractional digits, a SUSPECTED/REQUIRED/NOT_NEEDED classification and a reason. Reclassification keeps the record and its evidence history; it is not deletion.
- Confirmations append CONFIRMED, UNAVAILABLE or UNKNOWN evidence with a note, server timestamp and verified membership. They confirm availability of the specified full quantity at the specified location; no partial-quantity confirmation is implied.
- Every confirmation binds both the requirement revision and visit revision. Changing part, quantity, location or classification increments its revision. Changing visit time, or materially editing intake, increments the visit revision. Moving a visit away and back does not revive earlier confirmations.
- Manual part evidence is fresh only while its age is strictly less than the company lifetime, initially 24 hours. Owners can set 1–168 hours with a policy-version check. Freshness is evaluated against server time at approval, not against a stock guarantee at a future visit.
- Mandatory SAFETY/ACCESS prerequisites have an immutable code, label and rationale. Authorized managers append PASS, FAIL or UNKNOWN evidence with a note and visit revision. There is no disable/delete endpoint. Prerequisite evidence is visit-bound; unlike parts, no separate age lifetime is imposed in this pilot.
- Evidence is ordered by its monotonically increasing recorded job version so timestamp ties cannot select an older result. Role and company authorization are checked at recording time. Later staff departures do not retroactively erase the record of an authorized physical check.

## Readiness and state

A manager explicitly saves the planned arrival and confirms review of parts needs and safety/access prerequisites, including cases where none are needed. Missing review flags block preparation rather than treating empty tables as completed review.

Readiness checks return PASS/FAIL/UNKNOWN, BLOCKER/WARNING, explanatory text and evidence/verifier timestamps. Overall status is BLOCKED for failed or unknown blockers, NEEDS_REVIEW for unacknowledged warnings, otherwise READY. Required parts and mandatory safety/access checks cannot be overridden. Unconfirmed suspected parts produce warnings that require a reason. Acknowledgments are audited and cleared on material changes.

The arrival must be future and inside the job's customer window for readiness approval. Complaint, service category, address, equipment, explicit estimates and qualification policy are required. Existing jobs receive GENERAL_SERVICE as a migration default; this is a compatibility category, not an inferred diagnosis.

| Action | Preconditions | Result |
| --- | --- | --- |
| Save preparation/evidence | DRAFT, TRIAGED or READY; exact job version; no active reservation | Increment version; READY becomes TRIAGED; clear snapshot and warning acknowledgments; timeline/audit |
| Acknowledge a warning | Current warning, exact version and nonblank reason | Increment version; preserve other acknowledgments; never override a blocker |
| Mark ready | TRIAGED/READY, all preparation checks satisfied | READY; increment version; save current policy/evidence snapshot |
| Approve assignment | READY, exact version, current policy, live checks, eligible technician, approval reason and request key | ASSIGNED; reserve technician interval; persist approval snapshots, event, audit, outbox and successful retry response atomically |

Intake edits now support DRAFT/TRIAGED/READY. Material changes to READY return it to TRIAGED and invalidate visit-bound evidence. Assigned jobs reject ordinary intake, prerequisite and preparation changes. Cancellation, rescheduling, acknowledgment and execution remain Phase 6 work; there is no release shortcut in this phase.

READY is a persisted approval state, while readiness results are live evaluations. Evidence can expire or an owner policy can change without an asynchronous state rewrite. Assignment always re-evaluates current evidence and requires a fresh ready approval after a policy-version change. A stale READY label never bypasses a failed live check.

## Deterministic ranking

Hard eligibility from Phase 4 is checked before scoring. Eligible candidates use dispatch-v2:

`score = 0.60 × skillDepth + 0.25 × workloadHeadroom + 0.15 × assetFamiliarity`

- Skill depth averages `min(actualLevel / requiredLevel, 1.5) / 1.5 × 100`. General inspection uses a neutral 50.
- Workload headroom is `100 × max(0, 1 − bookedMinutes / availableShiftMinutes)` on the organization's local service date. Shift unions are clipped to that date, unavailable time is subtracted, and reservation intersections are unioned to avoid double counting. Day boundaries account for daylight-saving 23/25-hour days.
- Familiarity is `min(100, 25 × resolvedVisits)` for the same equipment during the preceding 365 days. It reads recorded resolved assignment outcomes. Phase 5 does not create resolved outcomes; without history it contributes zero and returns NO_HISTORY, not a performance judgment. Phase 6 will populate that evidence through closure.
- Scores round to two decimals only at the end. Ties use fewer booked minutes, then technician UUID. Ineligible candidates have no score and retain exclusion explanations. Preview results and feature contributions are persisted at approval.

Parts readiness gates the whole job; it is not a technician ranking feature. Unknown route estimates are not scored. Priority orders the intake queue URGENT, HIGH, NORMAL, LOW, then arrival start and job ID; priority does not distort technician scores or move existing appointments automatically.

## Approval, concurrency and retries

Assignment uses the existing company lock and rechecks active dispatcher/owner membership. Lock order is company → job → selected technician. Preparation/policy/availability mutations use compatible locks. Qualification changes are checked against active job requirements: unsafe downgrades/revocations are blocked, while unrelated added skills and safe improvements are allowed. The server rechecks current readiness, policy version, eligibility and ranking, and then creates the reservation. PostgreSQL exclusion and partial unique constraints independently guard technician overlaps and one active reservation/assignment per job.

The Idempotency-Key is scoped to company and approving membership, with a hash of job ID, observed version, selected technician and approval reason. Identical successful retries return the stored result even if the job has since advanced to ASSIGNED. A changed actor or payload using the same key returns 409. Failed attempts roll back without claiming the key. The browser retains the same key/payload after an interrupted response; a real-provider browser test drops a committed response and verifies safe retry.

Reservation, assignment, job version/state, immutable readiness/ranking snapshots, timeline, audit, pending outbox event and retry record commit together. No outbox message is sent in Phase 5: no external email, webhook or queue delivery is configured. Future consumers need their own idempotent delivery and retry handling. Local idempotency/outbox retention and operational cleanup remain future work.

## Verification and limits

The fifth migration is additive and transactional, with tenant-safe foreign keys, quantity/version/status checks and one-active-assignment uniqueness. New parts locations and evidence do not imply stock accounting or protection against competing parts use.

Tests cover expiry boundaries, visit/requirement revisions, mandatory checks, warning acknowledgment, current role/company authorization, owner policy changes, duplicate/lost-response approvals, atomic outbox records, concurrent overlapping assignments, weighted ranking, DST workload dates and assigned-state mutation protection. Browser fixtures add clearly fictional future shift days to avoid collisions with prior local approvals; these are demonstration records, not real scheduling promises.

This remains a local pilot implementation. AWS, managed production identity, monitoring/recovery, stock accounting, actual outbox delivery, technician execution and independently validated ranking benefits are not completed by this phase.
