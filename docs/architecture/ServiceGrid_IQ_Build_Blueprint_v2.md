# ServiceGrid IQ Build Blueprint

Product requirements and engineering specification

Version 2.0 | 16 November 2026 | Owner and engineering team

Build a focused dispatch readiness pilot before expanding into a field service platform. The pilot must help a manager identify missing job information, select an eligible technician, prepare the visit and record whether a follow-up was needed. Commercial expansion depends on measured customer adoption and willingness to pay.

This specification replaces the proposed v1.0 baseline for new implementation decisions. It preserves the long-term platform direction while resolving scope, inventory, scheduling, lifecycle, ranking and delivery ambiguities. Versioned architecture decisions may refine implementation details without weakening the business invariants below.

The accompanying OpenAPI JSON defines the pilot operations and payloads. It is a contract artifact, not a running backend. Database definitions in this document are logical implementation requirements; reviewed migrations and database integration tests remain implementation deliverables.

## Reading guide

- Sections 1 to 4 define the product, release boundaries, roles and workflow.
- Sections 5 to 9 define mandatory domain policies and data relationships.
- Sections 10 to 14 define API behavior, integration, AI, architecture and operations.
- Sections 15 to 18 define tests, implementation order, validation and completion criteria.
- Sections 19 and 20 record resolved limitations, risks and supporting sources.

## Version decisions

- Introduce a small pilot release independently of the full platform P0 list.
- Move basic revisit linkage and CSV onboarding into the pilot.
- Start CI, containers, deployment and logs with the first vertical workflow.
- Define parts states, scheduling intervals, permitted transitions and ranking features.
- Keep AI optional for the pilot; introduce evaluated, cited preparation after the core workflow.
- Retain multi-company security from the start; provision companies administratively in the pilot.

# 1 Product purpose and commercial boundaries

## Customer and problem

The initial candidate customer is an independent commercial HVAC or AC maintenance provider with approximately 5 to 30 technicians. This is a discovery hypothesis, not a proven ideal customer profile. The buyer is usually the owner or operations manager; dispatchers and technicians are daily users.

Incoming requests may lack exact equipment identification, useful history, a clear appointment plan or confirmation of relevant parts. ServiceGrid IQ makes these gaps visible before dispatch. It then ranks eligible technicians and provides a preparation card. A manager remains responsible for approving the assignment.

## Product position

Position the initial product as a readiness layer that can work with exported records from the customer's current tools. Do not require the customer to replace invoicing, payments, accounting or their entire service platform. Pilot CSV exchange is a deliberate starting interface; it is not a claim of live integration with any vendor.

The distinguishing hypothesis is that explicit evidence, missing-data checks, parts confirmation and follow-up classification create enough value to justify another workflow. Existing dispatching and HVAC knowledge products overlap substantially. This benefit must be demonstrated against each customer's current process.

## Boundaries

- No guaranteed first-visit resolution, diagnosis, savings or regulatory compliance.
- No autonomous dispatch, purchasing, payments or AI stock mutation.
- No full ERP, invoicing suite, route optimizer or predictive maintenance system in the pilot.
- No continuous precise employee tracking. Use branch or manually supplied travel estimates initially.
- Only authorized manuals, consented records and fictional public demo data may be ingested.
- Repair guidance remains advisory and subject to qualified human review.

## Three separate commercial outcomes

A service company buying a subscription is a customer sale. An investor funding the business is financing. A software company acquiring the product or company is an acquisition. A successful demo may support conversations about all three, but none is implied by a complete codebase. Prioritize a paid operational pilot before treating investment or acquisition as a planning assumption.

# 2 Release scope and requirement mapping

## Release definitions

DEMO is a synthetic, non-production demonstration. PILOT is a controlled online release for named companies and real users. PLATFORM is the broader operational product. SCALE is conditional on demand or a specific measured infrastructure need. These labels supersede v1 priorities for sequencing; original FR identifiers remain traceable.

| Capability | Pilot commitment | Later expansion |
| --- | --- | --- |
| FR 001 to 003 identity and access | Admin provisioning, managed sign-in, membership and role checks, tenant isolation | Self-service signup, richer branch administration |
| FR 004 to 006 records and lifecycle | Customers, sites, assets, jobs, audited transitions | Richer asset catalog and configurable workflows |
| FR 007 technician profile | Verified skills, shifts, unavailable intervals | Multi-crew and complex capacity planning |
| FR 008 inventory | Confirmed part requirements and attributed manual readiness evidence | Transactional ledger and reservations |
| FR 009 to 011 dispatch | Readiness checks, versioned ranking, human approval | Travel adapters and broader policies |
| FR 012 to 014 execution and audit | Assigned jobs, closure, timeline, basic metrics | Advanced reporting and dashboards |
| FR 019 and 021 onboarding and follow-up | CSV dry run and import, export, parent-job linkage and reason | Live vendor adapters and richer analytics |
| FR 015 to 018 and 020 AI and workers | Optional after core pilot works | Private library, indexing, cited assistant, notifications |
| FR 022 to 026 commercial and scale | Excluded from first pilot | Entitlements, portal, offline sync and optimization |

## Pilot inventory boundary

Pilot parts readiness is a named person's timestamped confirmation for a job and stock location, not a reservation or authoritative live stock ledger. The UI must say Manual confirmation and show who checked it and when. It must never display Reserved or imply protection against competing stock use. Reconfirm at assignment if evidence is stale. A customer requiring guaranteed allocations must use the ledger release before operational dispatch through this product.

## Pilot completion scenario

An authorized dispatcher imports or creates a job, resolves its blocking gaps, reviews eligible technicians, confirms one, and the assigned technician acknowledges and closes the visit. An unresolved closure creates a linked follow-up atomically. The owner can inspect the outcome and audit history. A second tenant cannot access any part of that workflow.

# 3 Users permissions and operating workflow

## Authorization model

Every tenant-owned resource is scoped by organization. Active organization is supplied in the request header and verified against the authenticated user's membership on every call. UUIDs are identifiers, never proof of authorization. Pilot memberships cover the whole organization; branch-specific access restrictions are a platform extension that must be implemented before promising that boundary to a customer.

| Role | Permitted actions | Restrictions |
| --- | --- | --- |
| Owner | Manage memberships, policies, imports, exports and organization metrics | Own organization only |
| Dispatcher | Manage records, triage, confirm parts, rank, assign, reschedule, review outcomes | Cannot grant roles or bypass mandatory restrictions |
| Technician | Read own assigned jobs, acknowledge, start, record observations and close | Cannot browse all customers, assign jobs or approve own overtime |
| Inventory manager | Ledger release stock receipts, adjustments and reconciliation | No dispatch authority unless separately granted |
| Platform operator | Provision tenants and operate infrastructure | No default customer-content access; exceptional audited support access |

Use OWNER, DISPATCHER and TECHNICIAN enum values in the pilot. Do not expose INVENTORY_MANAGER until the ledger release. A user may hold memberships in several companies. Role changes and membership revocation must invalidate or re-evaluate active privileges promptly.

## Dispatcher workflow

1. Select an authorized organization and create or import the customer, site and asset.
2. Record complaint, category, priority, arrival window, estimated duration and required skills.
3. Review missing fields, source history and part requirements. Ask for clarification where needed.
4. Mark mandatory preparation checks complete with evidence.
5. Request ranked eligible technicians for a specific appointment start and duration.
6. Confirm the selected technician. The server rechecks constraints and commits the assignment.
7. Monitor acknowledgement and handle delays or rescheduling with an audit reason.

## Technician and owner workflow

The technician sees only authorized assignments, reads preparation evidence, acknowledges, starts the job and records findings. Closure requires a resolution code and notes. If unresolved, the technician supplies a follow-up reason; the system creates the linked draft job. The owner reviews adoption, preparation time and follow-up reasons without assuming the software caused every improvement or failure.

# 4 Readiness and data quality policy

## Readiness output

Return individual checks containing code, status, severity, message, evidence reference, verifiedBy and verifiedAt when applicable. Status is PASS, FAIL or UNKNOWN. Severity is BLOCKER or WARNING. Overall status is BLOCKED if any blocker is FAIL or UNKNOWN, NEEDS_REVIEW if only warnings remain, otherwise READY. Do not collapse all evidence into one opaque percentage.

## Mandatory pilot checks

- A customer and site belong to the active organization, and any asset belongs to that customer and site.
- Complaint text, service category, priority and usable site address are present.
- The arrival window is valid, and duration and travel buffer are explicit.
- Required qualifications are specified by the dispatcher or a versioned service-type template.
- Each confirmed required part has current positive readiness evidence, or an authoritative reservation in the ledger release.
- Any mandatory site access or safety prerequisites defined for the job are confirmed by an authorized person.
- The selected technician is active, qualified and available at assignment commit.

Missing exact model is a warning for general inspection jobs unless a job template makes it mandatory. It always blocks model-specific AI claims. A part may be marked required only by a dispatcher or owner. AI can propose a suspected part with evidence but cannot promote it to required.

Create explicit job prerequisite records for mandatory SAFETY or ACCESS checks, with a code, label and manager-supplied rationale. Dispatcher or owner appends PASS, FAIL or UNKNOWN evidence with a note. Unconfirmed checks block preparation. Safety checks cannot be disabled after creation in the pilot; correct an incorrectly scoped job through cancellation and a replacement record with an audit link. These evidence changes increment job.version and invalidate READY. The technician preparation card shows these checks and the current parts confirmations.

## Evidence freshness

Default pilot manual part confirmation lifetime is 24 hours, configurable by the owner between 1 and 168 hours. This is a product baseline to validate, not a guarantee that stock remains available. Editing the part, quantity, location or scheduled visit invalidates its confirmation. Assignment checks evidence against the current server time. The preparation card displays both the timestamp and the lack of reservation protection.

## Overrides

Dispatchers may acknowledge warnings with a reason. Mandatory qualifications, company authorization, overlapping technician reservations and missing required-part confirmation are never overridable through assignment. To proceed without a previously required part, an authorized manager must explicitly reclassify it as suspected or not needed with a reason; readiness is recalculated and the change is audited. A genuinely mandatory safety requirement cannot be reclassified to evade a restriction.

Store the policy version and evidence snapshot at approval. Any material change invalidates READY, increments job.version and requires reevaluation before assignment.

# 5 Parts readiness and inventory accounting

## Part requirement states

| State | Meaning | Dispatch consequence |
| --- | --- | --- |
| SUSPECTED | Possible relevance, not confirmed necessary | Warning if unconfirmed; never automatically reserve |
| REQUIRED | Manager confirms required quantity and location | Block until manually confirmed in pilot or reserved in ledger release |
| NOT_NEEDED | Previously considered and explicitly dismissed | No readiness contribution; preserve rationale |

Availability is a separate evidence value: CONFIRMED, UNAVAILABLE or UNKNOWN. Requirement state must never be inferred from availability. Quantity is a positive decimal in the part's defined unit; pilot quantities permit three decimal places. Each requirement references one stock location, selected explicitly.

## Ledger release rules

For each organization, part and stock location, maintain a locked stock balance with on_hand and reserved. available = on_hand - reserved. Both values are nonnegative and reserved <= on_hand. An immutable movement records each receipt, consumption, return, transfer and correction. Reservations do not reduce on_hand; consumption reduces both reserved and on_hand for the consumed quantity.

Reserve REQUIRED quantities transactionally during assignment. If any required quantity cannot be reserved, roll back the entire assignment. A reservation belongs to one job and has ACTIVE, CONSUMED or RELEASED state. Partial consumption uses explicit consumed and released quantities with a remaining quantity; terminal state follows when remaining reaches zero. Do not overwrite movement history.

Rescheduling or cancelling releases unconsumed reservations in the same transaction as assignment cancellation. Closing resolved or unresolved releases unused quantities after recorded consumption. On rescheduling, new reservation is attempted only when a new assignment is confirmed. A returned unused item goes through a return movement referencing its original consumption. Never create a return for material that was not consumed.

Lock balances in stable part and location order to reduce deadlocks. Add a unique source-operation key to each movement to prevent duplicate consumption on retry. Inter-location transfer creates paired movements in one transaction; total tenant stock stays unchanged. Negative corrections cannot reduce on_hand below reserved without explicitly releasing or reallocating affected reservations first.

## Pilot safeguards

Pilot APIs reject reservation and consumption operations because the ledger is absent. Record reported parts used in job observations as non-accounting data. CSV stock snapshots are informational and timestamped. Do not silently promote a pilot snapshot into a live balance when enabling the ledger; perform a reconciled opening balance and preserve provenance.

# 6 Scheduling and time policy

## Three different time concepts

The customer arrival window is the acceptable interval for the technician to arrive. The appointment interval is [plannedStart, plannedStart + estimatedDuration). The technician reservation interval is [plannedStart - travelBuffer, plannedStart + estimatedDuration). These are half-open intervals, so adjacent reservations may share an endpoint without overlap.

Pilot duration is a positive whole number of minutes, initially 60 if a dispatcher explicitly accepts the displayed default. Travel buffer is a nonnegative whole number, initially 30 minutes with explicit acknowledgement. Neither value is a measured route estimate. Planned start must satisfy windowStart <= plannedStart < windowEnd. Reservation must fit the technician's shift and must not overlap unavailable time or another active assignment.

The baseline pilot books one technician per job. Multiple-technician work, split visits and jobs spanning multiple shifts are excluded. Reject an assignment that cannot fit; offer a new window rather than silently truncating time. Existing assignments are not moved automatically to accommodate an urgent job.

## Timezones and overtime

Store all instants as PostgreSQL timestamptz and exchange RFC 3339 UTC timestamps. Each organization stores an IANA timezone for display. Require an explicit offset when accepting local-time input; reject ambiguous or nonexistent daylight-saving times unless the user selects a valid offset. Calendar date is interpreted in the organization's timezone.

Overtime is disabled in the pilot. In the platform release, a specific owner-approved overtime availability block can extend shift coverage; qualification and overlap rules still apply. Technicians cannot approve their own overtime. Unexpected late completion raises a conflict warning for the next job; it does not rewrite the next appointment silently.

## Rescheduling and stale proposals

Changing the time, duration or assignee of an assigned or acknowledged job requires the reschedule operation. Cancel the active assignment, free its interval, release remaining reservations where applicable, store old and new windows and return the job to TRIAGED. Re-run readiness and ranking. For an in-progress visit, close unresolved with a follow-up instead of rewriting its start time.

Recommendations are advisory snapshots. Confirmation uses current server data, job.version and technician availability; a database exclusion constraint protects exclusive intervals against simultaneous assignments.

# 7 Job lifecycle and transition contract

## States and types

Job states are DRAFT, TRIAGED, READY, ASSIGNED, ACKNOWLEDGED, IN_PROGRESS, CLOSED and CANCELLED. Job type is INITIAL or FOLLOW_UP. FOLLOW_UP is never a lifecycle state. Rescheduling is an action with an event, not a durable state. A CLOSED job is immutable except for separately audited annotations that do not rewrite the original outcome.

| From | Action and actor | To | Preconditions and side effects |
| --- | --- | --- | --- |
| DRAFT | Triage by dispatcher | TRIAGED | Valid minimum intake; append event |
| TRIAGED | Mark ready by dispatcher | READY | No blocking preparation gaps; save policy version |
| READY | Material edit by dispatcher | TRIAGED | Invalidate preparation snapshot |
| READY | Assign by dispatcher | ASSIGNED | Current version, eligibility and parts checks; commit assignment and audit |
| ASSIGNED | Acknowledge by assigned technician | ACKNOWLEDGED | Assignment still active |
| ACKNOWLEDGED | Start by assigned technician | IN_PROGRESS | Record actual start; reject stale assignment |
| IN_PROGRESS | Close by assigned technician or dispatcher | CLOSED | Notes and outcome required; release interval and unused stock |
| ASSIGNED or ACKNOWLEDGED | Reschedule by dispatcher | TRIAGED | Reason required; cancel assignment and release resources |
| DRAFT TRIAGED READY ASSIGNED ACKNOWLEDGED | Cancel by dispatcher | CANCELLED | Reason required; release active resources |

An owner inherits dispatcher actions. Reject all unlisted transitions with 409 INVALID_TRANSITION. Intake edits are allowed in DRAFT and TRIAGED; material edits in READY return it to TRIAGED. After assignment, permit only scoped notes and attachments through ordinary editing; scheduling or prerequisite changes require rescheduling. Technician observations are append-only corrections where possible.

## Closure and follow-up creation

Outcome is RESOLVED or FOLLOW_UP_REQUIRED. Unresolved closure requires reason PARTS, SKILLS, INFORMATION, ACCESS, NEW_FAULT, CUSTOMER_REQUEST or OTHER, plus notes. PARTS, SKILLS and INFORMATION are candidate preventable categories, subject to manager review; they are not automatically causal proof.

In one transaction, close the original, create exactly one FOLLOW_UP draft for that closure, link parent_job_id and root_job_id, copy relevant context without copying assignments or confirmations, and append audit events. A uniqueness constraint on follow-up parent prevents duplicates. Further follow-ups link to the most recent closed follow-up. Do not reopen the original or create cyclic links.

# 8 Technician eligibility and deterministic ranking

## Hard eligibility

Filter before scoring. A technician must have an active membership and technician profile in the organization, the required verified unexpired skills, branch eligibility, shift coverage, no unavailable interval, no active reservation overlap and no recorded safety restriction. Missing qualification evidence fails eligibility. Authorization is enforced independently of ranking.

Evaluate the requested appointment including the travel buffer. A technician with no eligible slot is excluded with a reason. If none are eligible, return an empty list and constraint explanations. Never relax hard rules to manufacture a recommendation.

## Pilot scoring policy dispatch v2

For eligible technicians, score = 0.60 * skillDepth + 0.25 * workloadHeadroom + 0.15 * assetFamiliarity. Each feature is 0 to 100. Round the final score to two decimal places only after calculation. A score is an ordering aid, never a probability of repair success.

- skillDepth: each required skill has a level from 1 to 3. For each skill calculate min(technicianLevel / requiredLevel, 1.5) / 1.5 * 100, then average. Verification and expiry are hard checks. If no specialized skill is required, assign 50 to all eligible candidates and flag that the job is a general inspection.
- workloadHeadroom: 100 * max(0, 1 - bookedMinutes / shiftMinutes) for the organization's local service date. Use the union of reservation intervals intersecting available shift time to avoid double counting. Zero shift minutes means ineligible. This represents pre-assignment workload.
- assetFamiliarity: min(100, 25 * resolvedVisits) where resolvedVisits counts this technician's resolved jobs for the same asset during the preceding 365 days. A newly onboarded company with no imported history gets zero, flagged as NO_HISTORY rather than implied poor performance.

Sort descending by score, then ascending bookedMinutes, then ascending technician UUID. Persist policyVersion, input timestamp, feature values and exclusion reasons. Include only authorized personnel fields in responses.

## Parts travel and priority

Job-wide parts readiness is a gating check, not a pilot technician score. Add candidate-specific van-stock or collection logistics only after that data is trustworthy. Unknown travel estimates are shown as unknown and are not scored. Priority orders the dispatcher queue, not technicians for the same job: URGENT, HIGH, NORMAL, LOW, then arrival-window start and job ID. Travel optimization is a separate later policy.

Compare this ranking with earliest-available and dispatcher-choice baselines. Record overrides without treating disagreement as an error. Policy changes require a new version and repeatable evaluation fixtures.

# 9 Logical data model and constraints

## Common database rules

Use UUID identifiers consistently. Every tenant-owned table has organization_id NOT NULL and UNIQUE(organization_id, id). Foreign keys to tenant resources include organization_id on both sides; never rely solely on application filtering. Use timestamptz for instants, numeric(12,3) for quantities and integer minutes for duration. Add created_at and updated_at where mutable, and version integer >= 1 on jobs and mutable policy records.

| Entity | Required fields beyond common keys | Relationships and constraints |
| --- | --- | --- |
| organizations | name timezone status policy_version | Global organization record; timezone validated |
| users | auth_subject email status | Global identity; unique auth_subject |
| memberships | user_id role active | Unique organization and user; user references global users |
| branches | name address | Organization scoped |
| customers | name contact | Organization scoped; no shared customer across tenants |
| sites | customer_id address | Unique organization customer id combination for child references |
| asset_models | manufacturer model revision nullable | Tenant scoped initially; normalized uniqueness treats absent revision consistently |
| assets | customer_id site_id asset_model_id nullable serial nullable | Composite site and customer FK; model belongs to tenant |
| jobs | customer_id site_id asset_id nullable type state priority window_start window_end duration_min buffer_min version parent_job_id root_job_id | start < end; positive duration; tenant-safe customer site asset links |
| technicians | membership_id branch_id active | One profile per tenant membership; membership must be active at use |
| skills | code description | Unique organization code |
| technician_skills | technician_id skill_id level verified_by verified_at expires_at nullable | Unique technician and skill; level 1 to 3 |
| job_skills | job_id skill_id required_level | Unique job and skill; required level 1 to 3 |
| availability_blocks | technician_id starts_at ends_at kind | SHIFT or UNAVAILABLE; positive interval |
| assignments | job_id technician_id starts_at ends_at reserved_from state | One ACTIVE assignment per job; exclusive active technician interval |

Use a composite FK (organization_id, customer_id, site_id) against sites and a matching composite FK for a selected asset's customer and site. Add the supporting UNIQUE keys explicitly in migrations. A tenant-safe asset FK alone is insufficient to prove it belongs to the selected customer.

Use PostgreSQL btree_gist and an exclusion constraint on organization_id, technician_id and tstzrange(reserved_from, ends_at, '[)') for ACTIVE assignments. This excludes assignment overlap; assignment transactions also serialize shift and unavailability changes by locking the technician row.

# 10 Evidence events and extended data model

| Entity | Required fields beyond common keys | Integrity rule |
| --- | --- | --- |
| parts | sku description unit | Unique organization SKU |
| stock_locations | branch_id name type | BRANCH or VAN; tenant-safe branch link |
| job_part_requirements | job_id part_id location_id quantity requirement_state | Positive quantity; unique job part location |
| part_confirmations | requirement_id availability checked_by checked_at expires_at note | Append evidence; checker must be authorized |
| readiness_checks | job_id code status severity evidence_ref policy_version job_version | Snapshot cannot authorize a newer job version |
| job_prerequisites | job_id code label kind rationale | Unique job code; mandatory SAFETY or ACCESS; no silent deletion |
| prerequisite_evidence | prerequisite_id status note checked_by checked_at | Append-only; authorized manager; invalidate ready snapshot |
| job_observations | job_id assignment_id author_id text reported_parts_json | Tenant-safe references; technician must own active visit at write |
| job_closures | job_id outcome reason notes closed_by closed_at | Unique job; follow-up reason mandatory when unresolved |
| job_events | job_id actor_id type payload occurred_at | Append-only domain timeline |
| audit_events | actor_id action target_type target_id changes trace_id | Append-only privileged-change history |
| idempotency_records | actor_id operation key request_hash response expires_at | Unique organization actor operation key |
| import_batches | kind file_hash mapping status created_by | Validated rows and errors retain scoped provenance |
| external_records | source_system entity_type external_id internal_id | Unique organization source entity external ID |
| outbox_events | event_type aggregate_id schema_version payload published_at | Event ID unique; created with business transaction |

Each FOLLOW_UP job has a non-null parent_job_id and root_job_id; INITIAL has null parent and root equal to its own ID. Parent and child must share tenant, customer, site and asset where present. Permit one child per parent closure in this baseline. A deferred FK or transaction ordering can support the root self-reference. Application and integration tests enforce ancestry and prevent cycles.

## Platform extension tables

Ledger release adds stock_balances, stock_movements and stock_reservations with constraints from section 5. AI release adds documents, document_versions, document_chunks, job_document_links and ai_interactions. Each version references a private object key and immutable checksum; each chunk references that exact version and inherits tenant, branch and role permissions. A revoked version is excluded before retrieval and again before response assembly.

# 11 API contract and transaction behavior

## Shared contract

Use /api/v1, JSON, managed identity verification and X-Organization-Id for scoped calls. Never trust a role or tenant sent in a request body. Require If-Match with the current job version as a quoted strong ETag, for example "7", for job mutations. Return ETag on job reads and versioned mutation responses. Missing version returns 428; stale version returns 412. Sensitive mutations also require Idempotency-Key. Cross-tenant and inaccessible resource IDs return 404 consistently. An insufficient role for a known authorized route returns 403.

Error shape is {error: {code, message, traceId, details}}. details contains field or business-rule failures without SQL, secrets or other tenant data. List responses use {items, nextCursor}; default limit 25, maximum 100. RFC 3339 timestamps are UTC. Reject unknown properties in mutation inputs.

## Pilot operations

The accompanying OpenAPI file covers organization context, customer/site/asset creation, jobs, technician setup, readiness, recommendations, parts confirmation, assignment, technician actions, closure, rescheduling, cancellation, import/export, metrics and audit. UI screens use these operations rather than bypassing domain services. Login and password recovery are handled by the chosen managed identity provider and are not custom password APIs.

## Assignment transaction

Authorize membership and role. Validate version, idempotency key and payload. Lock the job, selected technician and applicable evidence; the ledger release also locks required stock rows in stable order. Check state READY, current readiness, appointment boundaries, qualifications, shifts, conflicts and part evidence. Create the assignment, change state, increment version, append audit and outbox event, and store the response for retries in the same transaction. Return 201 only after commit. On conflict, rollback and return 409; unmet mandatory policy returns 422.

## Idempotency and retries

Retain keys for at least 24 hours. The same actor, tenant, operation and key with the same canonical request hash returns the stored response without repeating mutation. A changed payload returns 409 IDEMPOTENCY_MISMATCH. An in-flight duplicate returns 409 RETRY_LATER. Evaluate a completed idempotency record before rejecting an otherwise stale If-Match on an exact retry. Business uniqueness constraints still protect operations after key expiry.

## Events

Event envelope is {eventId, organizationId, aggregateId, actorId, occurredAt, schemaVersion, type, payload}. Consumers record processed event IDs and are idempotent. Outbox polling has retry/backoff and visible failure state. Emails and indexing run after commit; provider failure must not undo confirmed dispatch. No API result may claim a notification was delivered merely because it was queued.

# 12 CSV onboarding and integration policy

## Pilot import datasets

- Customers: external_id, name, contact. Sites: external_id, customer_external_id, address.
- Assets: external_id, customer_external_id, site_external_id, manufacturer, model, serial optional.
- Technicians: external_id, membership reference, branch, skills and explicit availability supplied through validated mappings.
- Jobs: external_id, customer_external_id, site_external_id, asset_external_id optional, complaint, category, priority, window_start, window_end, duration_min and buffer_min.
- Parts: external_id, sku, description, unit. Imported stock snapshots have location, quantity and checked_at; they do not create reservations or job-specific confirmation.

Imports cannot create privileged users, assign roles, mark qualifications verified, assign technicians or close jobs. Skill claims need owner verification. A new technician requires an existing authorized membership. Historical outcome import is later scope; it must use a separately authorized mode, remain labelled imported and never execute live job transitions.

## Two-stage import

Dry run validates UTF-8 encoding, headers, dates, references, duplicate keys, tenant membership and size limits. Return row number, field, code and readable error. Default pilot limit is 5 MB and 2,000 rows per batch; process a reviewed batch atomically by dataset. A commit references the immutable dry-run ID and file hash, expires after 24 hours, revalidates references and requires idempotency. No silent partial import. Keep the original source and mapping in a protected, retention-limited store.

Use external_records mapping by tenant, source system and entity type. Reimporting a live job does not overwrite dispatch, closure or stock state. Conflicting updates produce an error report for review. No fuzzy automatic customer merge.

## Export and source ownership

Export authorized records and audit which user requested it. Neutralize spreadsheet-formula injection in human-opened CSV files and document the transformation. Protect files through short-lived authorized download links. Source system owns imported identifiers and imported factual fields; ServiceGrid owns readiness decisions, confirmations, recommendations and locally approved assignments. Live write-back is excluded until conflict ownership, scopes and vendor terms have been agreed.

Vendor APIs, marketplace approval, account tiers and rate limits must be checked before promising any integration. CSV compatibility is not an endorsement or partnership. Add one live adapter only when a pilot customer needs it and access is confirmed.

# 13 AI preparation and document governance

## Scope and permission

AI is optional for the core pilot. The first AI release answers job-preparation questions using approved exact-model manuals and authorized history. It produces summary, evidence, hypotheses, prep_checks, uncertainties, citations and safety_flags. It cannot confirm a required part, verify a skill, reserve stock or mutate dispatch state.

## Ingestion pipeline

1. Authorize upload and issue a short-lived private upload URL.
2. Validate actual file type, size and malware policy; keep quarantined until accepted.
3. Extract text and page structure; record parser version, checksum and extraction errors. Scanned manuals require OCR or an explicit unsupported status.
4. Chunk with tenant, document version, exact model, source page and access metadata.
5. Embed through an adapter, index lexical and vector search, and expose indexing status.
6. Revocation removes retrieval eligibility immediately; delete derived vectors and caches through a retriable tracked task.

## Retrieval and answer generation

Authorize the job and document scope first. Apply tenant/model/version/access filters before retrieval, then verify the selected sources again before assembling context. For an unknown or ambiguous model, ask for clarification and avoid model-specific repair claims. Use bounded lexical/vector retrieval; add a reranker only if evaluation justifies its cost.

Validate that every citation references a retrieved authorized source and identifies the page or section. Citation validity alone does not establish that a claim is supported; sample claims need human review. Treat manuals and customer uploads as untrusted content. Embedded instructions cannot alter access rules, tool privileges or output policy.

## Failure behavior and evaluation

No evidence means an explicit insufficient-evidence response. Conflicting or stale sources are shown as uncertain. Provider outage leaves deterministic readiness and dispatch available. Log model/prompt versions, source IDs, latency, token counts and safe metadata; do not log raw private manuals by default.

Create labelled fixtures for correct model retrieval, wrong-model exclusion, revoked documents, tenant leakage, prompt injection, unsupported claims and abstention. Record Recall@k, citation support, abstention behavior, latency and approximate cost per prepared job. Qualified domain review is required before using safety-sensitive content in an operational pilot.

# 14 Architecture and user interface

## Baseline implementation choices

Use TypeScript throughout. Frontend is React with Vite and a responsive technician interface. Backend is an Express modular monolith with Zod request validation. PostgreSQL is the operational source of truth. Select Prisma for the baseline ORM; use reviewed SQL migrations where PostgreSQL exclusion constraints or extensions require it. Pin supported runtime and dependency versions during repository setup rather than copying stale version numbers into this specification.

Modules are identity/tenancy, customer/assets, service operations, technicians/scheduling, readiness/dispatch, parts, audit/analytics and imports. Add knowledge/AI and workers when their release starts. Route controllers authorize and validate, domain services enforce policy, and repositories apply tenant-scoped persistence. Do not scatter lifecycle rules through UI components.

## Worker and storage evolution

The pilot may use PostgreSQL outbox polling for lightweight tasks. Introduce Redis and BullMQ for document ingestion and sustained asynchronous work when needed. Use S3-compatible private storage for files. pgvector plus PostgreSQL full-text search is the initial AI retrieval stack. All queued payloads contain tenant context and reauthorize applicable records during execution; payload tenant IDs are not trusted by themselves.

## Required screens

- Organization picker and sign-in.
- Dispatcher job queue ordered by priority and arrival window.
- Intake and job detail with customer, site, asset and preparation checks.
- Technician candidates with eligibility, score contributions and warnings.
- Assignment confirmation showing appointment, manual parts evidence and policy state.
- Technician My jobs, preparation card, observations and closure.
- Owner import dry run, policy settings, basic outcomes and audit timeline.

Library, chat, inventory ledger, advanced analytics and customer portal arrive in later releases. Every screen needs empty, loading, validation, permission-denied and retry states. The pilot is online-only: a mobile-friendly page is not an offline-sync implementation. Clearly show unsaved content and network failure; never silently report a failed status change as successful.

## Repository layout

Use apps/web, apps/api, apps/worker when introduced, packages/contracts, infrastructure, docs/architecture, docs/operations, docs/security and tests/fixtures. Keep README, license decision, contribution guide and feature checklist at repository root. Public screenshots and seed data are fictional; no client manuals, secrets or private exports enter Git history.

## Indexes and deletion

Index tenant plus job state/window, assignment technician/time, asset/time history, requirement job, and event job/time. Use keyset pagination. Retain operational history through policy-controlled anonymization and restricted deletion rather than unsafe cascade deletion. Expire private binaries, search chunks and derived AI caches through a tracked deletion job. Retention duration is an organization policy reviewed for the deployment jurisdiction before paid use.

# 15 DevOps security and operations from the start

## First vertical workflow

Create Dockerfiles, Compose with PostgreSQL, environment placeholders, migrations, seeds and liveness/readiness endpoints with the first working API and screen. Establish CI for type checking, lint, unit/integration tests and build. Deploy the same versioned image to staging. Use managed identity, TLS and structured logs immediately. Redis and object storage join Compose only when a feature requires them.

## Delivery and infrastructure

On a pull request run contract checks, tests and build. On protected main publish immutable images tagged by commit and release version. Deploy staging, apply backward-compatible migrations, run smoke tests and verify health. Production starts with a manual approval gate. Use expand-and-contract migrations; application rollback does not imply safe schema rollback. Document the migration forward-fix and recovery strategy per release.

Start with one application instance and managed PostgreSQL or an equivalently backed-up deployment. Keep staging and production data separate. Use least-privilege service accounts, secret storage, branch protection and deployment identities. Add infrastructure as code once the deployment target is chosen. Kubernetes is an optional learning extension, not a product prerequisite.

## Operational targets and failure response

For a controlled pilot, propose a 99 percent monthly availability objective during the agreed service hours, excluding scheduled maintenance as explicitly agreed. It is an internal objective, not a contractual SLA. Measure interactive API p95 below 500 ms for a documented initial workload of 10 concurrent users and 10,000 seeded jobs, excluding generation and bulk imports. Publish the test setup and results rather than claiming universal performance.

Before real operational reliance, set a proposed RPO of 24 hours and RTO of 4 hours with the customer. Use daily encrypted backups and a demonstrated clean-environment restore. If that data-loss window is unacceptable, enable more frequent recovery before launch. Monitor availability, errors, latency, queue failures, storage and database capacity. Add traces across API and workers as async features arrive. Alert routing must identify a responsible person and escalation method.

## Mandatory security controls

Enforce server-side roles, composite tenant references, secure managed sessions, private file access, request size limits, rate limits and safe logs. Threat-model IDOR, cross-tenant access, leaked downloads, session theft, stock races, injection and malicious documents. Test access through exports and workers as well as APIs. Define retention, deletion and exceptional support access before paid use. Adopt PostgreSQL RLS only with a connection-pooling-safe design and isolation tests; it does not replace application authorization.

# 16 Tests and acceptance matrix

| Area | Required acceptance evidence | Release gate |
| --- | --- | --- |
| Tenant isolation | Tenant A cannot access B through IDs, search, import, export, audit or worker | Pilot |
| Roles | Technician cannot assign, grant roles or read another technician's unrelated jobs | Pilot |
| Lifecycle | Every allowed transition and every forbidden transition are checked | Pilot |
| Scheduling | Simultaneous assignments for overlapping reservations permit exactly one | Pilot |
| Availability | Concurrent shift removal and assignment cannot commit incompatible results | Pilot |
| Parts evidence | Unknown stale or unavailable REQUIRED part blocks; suspected part warns | Pilot |
| Readiness | Material edits invalidate ready snapshot and increment version | Pilot |
| Idempotency | Exact retry repeats response; changed payload with same key fails | Pilot |
| Follow-up | Repeated unresolved close creates one linked child; original stays closed | Pilot |
| CSV | Dry run detects tenant/reference errors; commit is atomic and idempotent | Pilot |
| UI | Dispatcher to technician closure works on narrow screen and keyboard | Pilot |
| Recovery | Restore backup to clean environment and complete smoke workflow | Operational pilot |
| Stock ledger | Last-item race cannot oversell; retry cannot double-consume | Ledger release |
| AI | Wrong tenant/model/revoked source excluded; unsupported answer abstains | AI release |
| Resilience | AI or notification outage does not block committed core dispatch | Relevant dependency release |

Use unit tests for scoring and policies, integration tests against real PostgreSQL for constraints and transactions, API tests for roles/contracts, and browser tests for the main journey. Mocking database behavior is insufficient for overlap and stock races. Use synthetic multi-tenant fixtures and deterministic clocks for freshness and expiry tests.

## Demo dataset

Seed two organizations, two dispatchers, several technicians with varied qualifications, overlapping shifts, multiple assets and three readiness conditions: missing model, unconfirmed required part, and fully prepared job. Include a technician conflict and an unresolved visit requiring follow-up. Label all data fictional. A demo reset must not touch production.

## Performance and evidence

Run a representative baseline before optimizing. Record schema/index versions and environment. Store actual command output or CI links for release checks. Do not claim tests passed merely because test files exist. Contract syntax checks validate the artifact, not a backend that has not been implemented.

# 17 Implementation backlog and delivery sequence

## Milestone A Foundation and first deployed workflow

Set repository structure, identity adapter, organization membership, PostgreSQL migrations, contracts, CI and containers. Implement customer/site/asset creation and draft jobs. Deploy staging and prove tenant isolation. Completion means a fresh clone can run and a named staging user can create an authorized job. No production client dependency yet.

## Milestone B Complete pilot workflow

Add skills and availability, readiness checks, manual parts confirmation, ranking, transactional assignment, technician acknowledgement/start/close, follow-up creation, CSV onboarding, basic metrics and audit. Include mobile error states. Completion means the section 2 scenario and all pilot acceptance cases pass. Keep optional AI out of the critical path.

## Milestone C Operational pilot

Onboard a named design partner, agree supported workflow and data ownership, perform recovery drill, define support, and run shadow mode before manager-approved live usage. Measure baseline and pilot effort. Do not call a synthetic demo a production-ready deployment.

## Milestone D Validated extensions

Choose inventory ledger, cited manual preparation or a live integration based on the partner's highest-cost gap. Each extension has an independent acceptance gate. Introduce BullMQ when sustained background processing warrants it. Improve onboarding and entitlements only when conversion or support burden creates the need.

## Milestone E Platform and scale

Conditional features include branch restrictions, advanced stock, billing provider, customer portal, offline capture, route assistance and batch scheduling. Benchmark first. Scale API and workers independently as needed; no requirement to extract microservices.

## Suggested 40 hour demonstration budget

This is a scope cap for a synthetic demo, not a promise of pilot readiness: 4 hours setup and deployment; 8 hours seeded job/asset screens; 8 hours readiness and simple ranking; 8 hours assignment and technician closure; 4 hours follow-up display; 4 hours focused tests; 4 hours demo polish and README. Use seeded users and fixed availability where necessary and disclose those limits. Exclude real multi-client production operation, live stock accounting, vendor integration and operational AI. If the core flow is unfinished, cut screen breadth rather than pretending safeguards exist.

# 18 Commercial validation and decision gates

## Discovery before broad implementation

Interview owners, dispatchers and technicians at 8 to 12 relevant companies if access permits. Ask about recent failed visits, existing software, actual records, stock accuracy, manual research and tolerance for another tool. Request examples with consent. Count preventable preparation problems separately from faults that could only be discovered on site.

Seek 2 to 3 design partners willing to share permitted sample records and test a workflow. Interest and compliments are weak evidence; recurring usage, data cooperation and a paid pilot are stronger. Do not turn these suggested counts into claims of statistical validation.

## Metrics with explicit definitions

- First-visit completion: resolved INITIAL jobs with no linked follow-up during 14 days, divided by eligible INITIAL jobs whose observation window has matured. Show cohort size and missing outcome data. Unlinked revisits can cause undercounting and need manager review.
- Follow-up rate: eligible initial jobs with a linked follow-up divided by eligible initial jobs, grouped by reason and service type. Exclude planned multi-visit projects and disclose exclusions.
- Preparation effort: measure active dispatcher time for a sample and separately report elapsed creation-to-approval time. Waiting for customers is not active labor.
- Adoption: jobs processed through readiness divided by eligible jobs, plus technician preparation-card use and user-reported burden.
- Economics: realized customer benefit, onboarding/support effort, hosting and AI cost. Avoid double-counting saved time and capacity revenue.

## Continue narrow or stop

Suggested commercial continuation gate: at least one customer accepts a paid pilot or comparable concrete purchasing commitment, uses it repeatedly, and identifies a readiness gap their current workflow does not solve adequately. Also require acceptable data-entry effort and an affordable delivery/support path. A small short pilot cannot prove causal reduction in revisits; report descriptive evidence honestly.

Narrow or stop commercial expansion if interviews show no recurring preparation pain, data cannot be maintained, customers require wholesale replacement, or nobody commits after a credible trial. The project may still be retained as a DevOps portfolio artifact. Spending two months solely because an acquisition might occur is not supported by the available evidence.

## Pitch materials

Customer pitch: one workflow, current pain, measured pilot outcome, onboarding burden and pricing proposal. Investor pitch: customer evidence, differentiation, market hypothesis, retention, economics and distribution. Acquisition discussion: strategic fit, transferable IP and data rights, customer relationships and a capability the buyer would prefer to acquire. This engineering specification supports diligence; it is not an investor deck or acquisition offer.

# 19 Resolved limitations and remaining risks

| Review issue | Resolution in this version | Verification |
| --- | --- | --- |
| Large P0 scope | Separate pilot from full platform; named exclusions | Release checklist in sections 2 and 17 |
| Revisit tracking late | Atomic linked follow-up in pilot | Duplicate closure and ancestry tests |
| Import/export late | Pilot dry run commit and export | Tenant-safe atomic import tests |
| Parts policy ambiguous | Requirement and availability separated; manual evidence versus ledger explicit | Staleness and required-part checks |
| Scheduling underspecified | Arrival appointment and reservation intervals defined | Boundary overlap shift and reschedule tests |
| Lifecycle incomplete | Transition matrix; follow-up type; reschedule action | Allowed and rejected transition suite |
| Ranking vague | Defined feature math and missing-data behavior | Reproducible scoring fixtures and baseline comparison |
| Schema and APIs illustrative | Tenant relationships and constraints specified; accompanying pilot OpenAPI | Reviewed migrations and contract checks during implementation |
| DevOps postponed | CI staging containers logs and recovery gates moved early | First-workflow deployment and restore evidence |

## Remaining decisions and accountable timing

Before the first migration, engineering confirms supported PostgreSQL/runtime versions and the managed identity provider. Before real client onboarding, owner and customer agree jurisdiction, retention, data use, service hours, support contact and acceptable recovery targets. Before live vendor integration, verify account permissions, API access and synchronization ownership. Before AI rollout, verify document rights, provider data handling and evaluation results.

## Residual risks

Manual stock confirmation can become wrong immediately after checking. Skills and service records can be inaccurate. A high score can still produce an unsuccessful visit. Existing tools may solve the same need sufficiently. Integrations may be expensive or unavailable. AI may retrieve plausible but incorrect evidence. These risks require workflow design and validation; additional infrastructure alone will not solve them.

## Completion rule

A feature is complete when its contract, implementation, migrations, permission tests, applicable concurrency tests, UI behavior, operational notes and truthful demo all agree. Record unresolved limits. Keep commits reviewable and do not allow generated code to bypass tenant checks, transaction boundaries or explicit human approval.

# 20 Sources and engineering handoff

## Source and revision basis

ServiceGrid IQ Product and Engineering Blueprint, working baseline v1.0, 16 November 2026, 17 pages. This version carries forward its product boundaries, FR identifiers, modular architecture, source-grounded AI, multi-tenancy, auditability, research discipline and documentation standards while revising sequencing and domain policies.

## Current competitor references

The following official product descriptions were checked on 16 November 2026. They establish feature overlap, not proof that every customer segment is served or that a precise unmet opportunity exists.

- ServiceTitan Dispatch Pro describes technician matching using skills, performance, drive time and predicted job value, with assisted and automated modes. https://www.servicetitan.com/features/pro/dispatch
- ServiceTitan help describes applying hard constraints before assignment predictions. https://help.servicetitan.com/docs/dispatch-pro-overview
- Housecall Pro's Bluon integration describes equipment identification, manuals, parts information and AI support inside the service workflow. https://help.housecallpro.com/en/articles/11557855-bluon-integration
- Jobber describes existing scheduling and structured visit checklists. https://www.getjobber.com/features/scheduling/ and https://help.getjobber.com/en/articles/checklists/

Do not copy competitor outcome claims into a ServiceGrid pitch. No revenue, customer count, investment likelihood or acquisition probability is asserted for ServiceGrid.

## First engineering tasks

1. Create the repository, choose a license appropriate to the commercialization plan, and record the identity and deployment choices.
2. Translate section 9 into reviewed SQL migrations with tenant-safe composite foreign keys and assignment exclusion constraints.
3. Generate or implement request validators from the accompanying OpenAPI schemas and reject unknown mutation fields.
4. Build the deployed Milestone A workflow with CI and a two-tenant test fixture.
5. Implement the pilot policies one vertical workflow at a time, attaching acceptance evidence to each requirement.
6. Validate with design partners before enabling ledger, AI, paid production or broader platform scope.

## API artifact status

ServiceGrid_IQ_Pilot_OpenAPI_v2.json is an OpenAPI 3.1 contract for the pilot. It defines typed request and response structures and shared error handling for the initial workflow. It does not contain provider-specific authentication implementation, database migrations, later ledger APIs or the AI release. Those are separate engineering tasks with their own acceptance gates. Changes to this specification and the contract must be versioned together.
