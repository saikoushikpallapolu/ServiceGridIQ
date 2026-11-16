# Phase 4 scheduling foundation

The owner explicitly authorized continuing locally and deferring AWS account creation and staging on 16 November 2026. This supersedes the previous sequencing recommendation to deploy before Phase 4; it does not mark cloud deployment complete. See the [implemented API](../api/phase-4-openapi.json).

## Scope and access

- Owners create company branches, the skill catalog and one technician profile per active TECHNICIAN membership. Owners alone change profile branch, active/safety status or verify/revoke qualifications.
- Dispatchers and owners view workforce records and manage explicit shift/unavailable intervals. Technicians cannot manage or view this company-wide workspace. Technician self-service and assignment-scoped views are later work.
- Job requirements specify a service branch and either distinct required skills at levels 1–3 or explicit general inspection with no specialized skill. Other company branches are excluded unless the dispatcher explicitly permits them for that job. Branches govern scheduling eligibility, not authorization: existing memberships remain company-wide.
- Tenant-safe composite foreign keys connect branches, profiles, verifiers, skills, job requirements, availability and reservations. Owner-only writes recheck owner status inside the company authorization transaction, preventing a concurrent demotion from retaining owner privileges.
- Local rate limits now separate a 1,000-request/minute observed-IP ceiling from a 300-request/minute authenticated-user limit and the existing 20 login-starts/minute IP limit. User buckets use the verified server-side identity, not a browser-supplied user/header. This avoids all staff behind Nginx sharing the previous low workspace bucket. Limits remain process-local; hosted proxy/distributed-limit configuration is still pending.

## Appointment semantics

The arrival window is [arrivalStart, arrivalEnd). The proposed arrival must lie inside it. Work occupies [plannedStart, plannedStart + estimatedDuration). The technician reservation is [plannedStart − travelBuffer, workEnd). The buffer is a manual estimate, not a calculated route.

One explicit shift must contain the entire reservation. Adjacent shifts are not merged, split visits are not supported and overtime is disabled. An unavailable interval or active reservation conflicts only when the half-open intervals intersect; sharing an endpoint is allowed. Availability intervals are positive and at most seven days long. The UI labels its browser time zone and converts to offset-bearing ISO timestamps; the database stores timestamptz. Recurring shifts, daylight-saving recurrence rules and automatic slot finding are not implemented.

## Qualifications and explanations

The owner records a skill level, evidence note, verified timestamp, verifier membership, active status and optional expiry instant. This is recorded owner verification, not independent certification validation. Expiry must remain valid through work end and must not already be expired at evaluation time. Revoked, missing or insufficient evidence fails eligibility. Historical demo records do not bypass current membership or qualification checks.

Every candidate returns independent checks for active profile/user/TECHNICIAN membership, safety restriction, branch eligibility, required qualifications, shift coverage, unavailability and reservations. Each required skill also has a named level/expiry check. Ineligible profiles remain visible with reasons. No ranking score or predicted repair success is provided.

## Transactions and concurrent changes

Company mutations acquire the company lock and recheck role/access. Workforce mutations then lock the technician. The internal reservation primitive locks company (by its caller), job and technician in that order, re-evaluates eligibility, and attempts the reservation within the same transaction. Availability mutations take that same technician lock, so simultaneous unavailability/shift removal and a reservation cannot both commit incompatible states.

PostgreSQL btree_gist exclusion constraints reject overlapping active technician reservations even for direct concurrent database writes. A partial unique index allows only one active reservation per job. Another exclusion constraint prevents overlapping availability intervals of the same kind. CHECK constraints enforce positive intervals, levels and versions. The migration creates btree_gist transactionally; a hosted database deployment must verify extension permissions.

The reservation primitive is internal and has no HTTP route or booking UI. It is tested as the Phase 5 scheduling foundation. It does not implement parts readiness, assignment approval, assignment lifecycle, idempotency or outbox behavior. Phase 5 must supply those gates and its own transactionally recorded assignment/audit behavior before exposing assignment. Direct SQL writes are privileged and can bypass application shift/qualification validation; the database exclusion constraints still enforce overlap and foreign-key invariants.

Changing job scheduling requirements increments the job version and writes timeline/audit atomically. Technician profile, skill and availability mutations share a technician version, rejecting stale forms. Job intake edits, state changes and policy changes reject active reservations. Profile restrictions/branch changes and qualification changes conservatively reject future active reservations; release/reassignment workflows arrive later. Availability rows are immutable except removal, and removal is rejected if an active reservation depends on that shift.

Eligibility previews run in a consistent read snapshot. They do not reserve time and can become stale immediately. UI changes clear previews, and future assignment must recheck everything inside its transaction. This phase never promises availability from a preview alone.

## Pilot limitations and verification

Branches and catalog skills have case-insensitive company-unique names; rename/archive and technician profile deletion are not provided yet. Workforce lists are paginated, but profile payloads include recorded availability and evidence history without dedicated nested pagination. This is suitable only for the small local dataset; introduce bounded interval queries, archival and searchable pickers before larger deployments.

Local fixtures create main/annex branches, fictional qualifications, profiles with different eligibility, and a demo shift on 1 December 2026. Fictional directory-only technicians have no login credentials. Existing profiles, skill revocations and deleted demo shifts are preserved by repeat seeding. Production accounts, AWS, monitoring, backups and recovery remain pending.

Verification includes unit boundary tests, real PostgreSQL tenant/constraint tests, simultaneous overlapping reservations, simultaneous shift removal/unavailability and reservation creation, role/CSRF/version checks, and owner/dispatcher browser flows at desktop and mobile widths. See the [completion checklist](../plans/phase-4-checklist.md).
