# Phase 3 completion checklist

Scope: local customer, equipment and service intake. Phase 2 local completion was verified before implementation. AWS staging and production identity remain deferred.

- [x] Customer, service-site and equipment creation, lists and edits.
- [x] Matching tenant-safe customer/site/equipment relationships in the database.
- [x] Complaint, priority, arrival windows, duration and travel estimates.
- [x] Dispatcher queue with search, filters and pagination.
- [x] Detail view, equipment-request history and actor-attributed timeline.
- [x] Server-enforced DRAFT/TRIAGED transitions and correction reasons.
- [x] Version checks on edits and transitions; stale job forms are preserved.
- [x] Transactional job timeline/audit and role rechecks during mutations.
- [x] Fictional records for two companies with idempotent local seed.
- [x] Implemented API contract, design decisions and local walkthrough.
- [x] Build, lint and type checks passed; 18 unit/protocol tests and 26 PostgreSQL integration tests passed; dependency audit reported no known vulnerabilities.
- [x] Seven full-Docker real-provider browser scenarios and smoke checks passed; desktop and 390px mobile screenshots visually reviewed.
- [ ] Successful GitHub CI evidence recorded.

## Deferred

AWS staging, production identity, real customer onboarding, technician assignments, scheduling, readiness, parts, completed visit outcomes, imports/exports, master-record relocation/archival and production operating safeguards.

See the [walkthrough](../operations/phase-3-local.md), [design](../architecture/0003-service-intake.md) and [API contract](../api/phase-3-openapi.json).
