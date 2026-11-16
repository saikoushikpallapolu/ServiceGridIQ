# Phase 4 local completion checklist

The owner authorized Phase 4 locally and explicitly deferred AWS account creation/staging on 16 November 2026. This supersedes the earlier deployment sequencing gate; cloud readiness is still incomplete.

- [x] Company branches and technician profiles connected to existing memberships.
- [x] Owner-only verification, evidence, levels, expiry and revocation of skills.
- [x] Explicit shifts and unavailable intervals, with stale-version checks.
- [x] Branch/qualification policy per job, with explicit general inspection.
- [x] Separate arrival, work and travel reservation interval calculations.
- [x] Explainable eligibility for access, branch, safety, skills, shifts and conflicts.
- [x] Tenant-safe foreign keys, partial uniqueness and PostgreSQL exclusion constraints.
- [x] Internal reservation primitive with rechecks; no premature public assignment API.
- [x] Transactional audit/timeline and current role checks on mutations.
- [x] Fictional main/annex technicians and demo scheduling data.
- [x] 23 unit/protocol tests and 39 PostgreSQL integration tests passed, including overlapping reservations, availability races and verified-user rate buckets. Docker builds, type checks and lint passed; production dependency audit reported no known vulnerabilities.
- [x] All nine full-Docker real-provider browser scenarios and smoke checks passed. Desktop and 390px mobile eligibility screenshots visually reviewed.
- [ ] Successful GitHub CI evidence recorded.

Public assignment, ranking, parts readiness, scheduling release/reschedule lifecycle, technician self-service and AWS/production operation remain outside this phase. See the [walkthrough](../operations/phase-4-local.md) and [design](../architecture/0004-scheduling-foundation.md).
