# ServiceGrid IQ Phase Wise Build Plan

Implementation schedule | 16 November 2026

Build a complete core workflow first, deploy it early, then add inventory and AI according to customer evidence. Allow approximately 180 to 260 focused hours for the controlled pilot, including contingency. At 25 hours per week, plan for approximately 8 to 11 weeks. Estimates depend on experience and implementation issues; they are not delivery commitments.

Each phase ends with a working demonstration and relevant checks. Phases run sequentially. Week ranges reflect uncertainty in earlier phases rather than parallel development. Customer discovery runs alongside Phases 1 to 3.

## Pilot schedule

| Phase | Estimated hours | Approximate position |
| --- | --- | --- |
| 1 Setup and deployment | 12 to 18 | Week 1 |
| 2 Authentication and company isolation | 18 to 26 | Weeks 1 to 2 |
| 3 Customers equipment and intake | 20 to 28 | Weeks 2 to 3 |
| 4 Technician skills and scheduling | 18 to 26 | Weeks 3 to 4 |
| 5 Readiness and approved assignment | 26 to 36 | Weeks 4 to 6 |
| 6 Technician workflow and follow-up | 22 to 30 | Weeks 5 to 7 |
| 7 CSV onboarding and reporting | 20 to 28 | Weeks 6 to 8 |
| 8 Operational pilot readiness | 24 to 36 | Weeks 7 to 10 |
| Contingency | Approximately 10 percent | Allow through Week 11 |

Phases 1 to 8 total 164 to 228 hours before contingency. The rounded 180 to 260 hour allowance includes additional room for integration issues. Phases 9 and 10 are extensions outside that pilot budget.

Contact prospective pilot companies early and demonstrate progress. Their feedback should determine whether inventory, AI preparation or a live integration becomes the first extension.

# Phase 1 Project setup and first deployment

Estimated effort: 12 to 18 hours

- Building the repository structure using TypeScript, with separate frontend, backend and shared-contract folders.
- Building the frontend foundation using React and Vite.
- Building the backend foundation using Express and Zod for request validation.
- Building the local database environment using PostgreSQL and Docker Compose.
- Building database migration and fictional seed-data commands using Prisma and reviewed SQL.
- Building the initial CI pipeline using GitHub Actions for type checks, linting, tests and builds.
- Building API health checks and structured logs for deployment troubleshooting.
- Deploying the first frontend and API to staging.

Completion: A fresh clone runs locally, CI passes and the staging application can reach its database.

## Phase 2 Authentication and company isolation

Estimated effort: 18 to 26 hours

- Building sign-in and sign-out using a managed identity provider.
- Building organization memberships using owner, dispatcher and technician roles.
- Building organization selection for users belonging to multiple companies.
- Building backend authorization checks for every protected operation.
- Building tenant-scoped database access and composite foreign keys to prevent cross-company relationships.
- Building fictional users and records for two separate companies.
- Testing unauthorized access, role restrictions and cross-company data isolation.

Completion: Users can sign in and access only the records permitted by their company membership and role.

# Phase 3 Customers equipment and service intake

Estimated effort: 20 to 28 hours

- Building customer and service-site records using tenant-scoped database tables.
- Building equipment records containing manufacturer, model, serial number and service location.
- Building the job-intake form for complaints, priority, arrival windows, estimated duration and travel buffers.
- Building the dispatcher's job queue with filtering and pagination.
- Building job-detail screens showing equipment information and recorded history.
- Building draft and triaged job states with server-side transition rules.
- Building job version checks to prevent accidental overwriting of another user's changes.
- Recording important changes in the job timeline and audit trail.

Completion: A dispatcher can create a customer, equipment record and service request, then view and triage the job.

## Phase 4 Technician skills and availability

Estimated effort: 18 to 26 hours

- Building technician profiles connected to company memberships and branches.
- Building owner-verified skills with qualification levels and optional expiry dates.
- Building technician shifts and unavailable periods using explicit time intervals.
- Building appointment calculations that distinguish arrival windows from occupied technician time.
- Building eligibility checks for qualifications, shift coverage, branch policy and conflicts.
- Building database constraints that prevent overlapping active assignments.
- Testing scheduling boundaries and simultaneous assignment attempts.

Completion: The application can explain which technicians are eligible for a proposed appointment and why others are excluded.

# Phase 5 Readiness checks and approved assignment

Estimated effort: 26 to 36 hours

- Building the parts catalog and stock-location records.
- Building job-part requirements that distinguish suspected, required and unnecessary parts.
- Building timestamped manual parts confirmations showing who checked availability and when.
- Building safety and access prerequisites with recorded confirmation evidence.
- Building the readiness engine to show passed checks, warnings, unknown information and blockers.
- Building deterministic technician ranking using verified skills, workload and asset familiarity.
- Building candidate explanations showing the contribution of each ranking factor.
- Building manager-approved assignment with current eligibility and evidence rechecked before commit.
- Building idempotency handling to prevent duplicate assignments from retries or double-clicks.
- Building transactional assignment, audit and outbox records.

Completion: A dispatcher can resolve preparation gaps, compare eligible technicians and safely approve an assignment.

Pilot limitation: Parts are manually confirmed in this phase; they are not reserved against competing stock use.

## Phase 6 Technician workflow and follow-up tracking

Estimated effort: 22 to 30 hours

- Building a mobile-friendly technician workspace showing authorized assignments.
- Building preparation cards containing job information, prerequisite evidence and parts confirmations.
- Building acknowledgement and start actions using enforced lifecycle transitions.
- Building technician observations and reported parts usage as non-accounting records.
- Building job closure with required notes and resolved or follow-up-required outcomes.
- Building atomic follow-up creation linked to the original job and its recorded reason.
- Building cancellation and rescheduling that release technician time and require preparation to be reviewed again.
- Building clear loading, network-failure and unsaved-change states.
- Testing the complete dispatcher-to-technician workflow.

Completion: A technician can complete a visit or create a traceable follow-up without silently reopening the original job.

# Phase 7 CSV onboarding and basic reporting

Estimated effort: 20 to 28 hours

- Building CSV dry-run validation for customers, sites, assets, technicians, jobs and parts.
- Building import mapping using external identifiers to avoid duplicate records.
- Building atomic import commits with readable row-level error reports.
- Building protected CSV exports for authorized users.
- Building basic reporting for readiness gaps, preparation elapsed time and follow-up reasons.
- Building cohort calculations that exclude jobs whose follow-up observation window has not finished.
- Building the owner's audit view.
- Testing import retries, invalid references, exports and tenant boundaries.

Completion: A pilot company can load its permitted records and review the initial operational results.

## Phase 8 Operational pilot readiness

Estimated effort: 24 to 36 hours

- Strengthening deployment workflows using immutable container images and staging smoke tests.
- Configuring production secrets, TLS, rate limits and separate staging and production data.
- Building monitoring for availability, API errors, latency and database capacity.
- Configuring encrypted backups and demonstrating restoration into a clean environment.
- Testing application rollback and documenting database migration recovery.
- Running representative load tests and recording actual results.
- Completing mobile, permission, concurrency and main-workflow checks.
- Writing deployment, incident-response, recovery and onboarding instructions.
- Preparing a fictional demo and onboarding one agreed pilot partner.
- Running shadow-mode recommendations before relying on the application operationally.

Completion: The controlled pilot can operate with agreed limitations, recovery expectations and a responsible support contact.

# Phase 9 Document ingestion and cited AI preparation

Additional estimated effort: 35 to 55 hours. Start after validating the core workflow; this phase is outside the pilot budget.

- Building private manual uploads using S3-compatible object storage.
- Building document validation and quarantine before indexing.
- Building the ingestion worker to extract and chunk approved manuals.
- Using Redis and BullMQ to queue ingestion tasks, track progress and retry failures.
- Building document-version, equipment-model and authorization metadata for every chunk.
- Building embeddings and hybrid retrieval using PostgreSQL, pgvector and full-text search.
- Building job-specific preparation summaries with citations, uncertainty and evidence gaps.
- Building evaluation cases for wrong models, revoked documents, unsupported answers and cross-company access.
- Building provider-cost monitoring and ensuring AI outages do not block dispatch.

Completion: Authorized users can obtain evaluated preparation guidance from approved sources.

## Phase 10 Transactional inventory and integrations

Additional estimated effort: 30 to 50 hours for inventory. Estimate integrations separately after discovery and vendor-access checks.

- Building stock balances and immutable movements for receipts, consumption, returns and corrections.
- Building transactional parts reservations during assignment.
- Building reservation release during cancellation, rescheduling and closure.
- Testing last-item reservation races and duplicate consumption attempts.
- Building stock reconciliation and an explicit transition from manual confirmations to ledger-backed availability.
- Building a live integration only after confirming a pilot customer's need, vendor access and synchronization rules.

Completion: Parts allocations are protected by transactions, with an auditable stock history. A live integration has its own scope, estimate and acceptance gate.

The sequence of Phases 9 and 10 may change based on the pilot customer's highest-priority problem. Do not expand either phase solely to increase the technology count.
