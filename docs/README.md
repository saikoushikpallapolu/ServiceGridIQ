# Documentation

## Reading order

1. [Current build blueprint](architecture/ServiceGrid_IQ_Build_Blueprint_v2.md) defines product boundaries and engineering policies. A [formatted PDF](architecture/ServiceGrid_IQ_Build_Blueprint_v2.pdf) is included.
2. [Phase-wise build plan](plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.md) defines sequence, estimates, and completion gates. A [formatted PDF](plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.pdf) is included.
3. [Pilot OpenAPI contract](api/ServiceGrid_IQ_Pilot_OpenAPI_v2.json) defines the proposed pilot requests and responses.
4. [Phase 2 authentication contract](api/phase-2-openapi.json) and [local sign-in guide](operations/phase-2-local.md) describe the implemented auth subset.
5. [Phase 3 intake contract](api/phase-3-openapi.json), [walkthrough](operations/phase-3-local.md) and [design](architecture/0003-service-intake.md) describe customer-to-job intake.
6. [Phase 1 checklist](plans/phase-1-checklist.md) records the foundation and deferred cloud gate.

## Source of truth

The v2 blueprint supersedes the [original v1 blueprint](archive/ServiceGrid_IQ_Product_and_Engineering_Blueprint.pdf). Keep archived material for provenance, not as competing implementation instructions. Versioned decisions may refine the baseline; update affected contracts and acceptance criteria together.

Markdown files are editable document sources. Refresh their PDF companions and inspect the pages when their content changes. The initial phase-plan schedule is a planning baseline; record actual completion evidence in the phase checklist.

## Status

The repository now includes the Phase 1 frontend, health API, PostgreSQL foundation migration and seeds, local Docker services, CI, and AWS staging templates. Phase 2 adds local OIDC authentication, server-side sessions, company selection, roles, invitations and audit. Phase 3 implements customer/site/equipment records and versioned draft intake, job filtering, triage, timeline and equipment history. Phases 4–6 extend this foundation with scheduling, readiness, assignment and technician execution; see their current records below. The pilot OpenAPI file remains a future contract; the implemented authentication subset has its own contract. The owner explicitly deferred AWS staging to continue local development through Phase 3. See [local setup](operations/local-development.md), [AWS setup](operations/aws-staging.md), and [accepted decisions](architecture/0001-phase-1-foundation.md).

The [Phase 2 checklist](plans/phase-2-checklist.md) tracks current authentication completion.

The [Phase 3 checklist](plans/phase-3-checklist.md) tracks intake completion and its separate staging gate.

Phase 4 adds [technician skills and availability](architecture/0004-scheduling-foundation.md), an [implemented API contract](api/phase-4-openapi.json) and a [local walkthrough](operations/phase-4-local.md). The owner explicitly deferred AWS again to continue locally; the previous recommendation to deploy before Phase 4 is superseded.

Phase 5 implements [readiness and assignment](architecture/0005-readiness-and-assignment.md), with a [local walkthrough](operations/phase-5-local.md) and [API contract](api/phase-5-openapi.json). It extends intake to READY/ASSIGNED and supersedes earlier statements that public assignment is unavailable. Parts remain manually confirmed, and outbox delivery is not configured.

Phase 6 completes the local core workflow: [technician visit design](architecture/0006-technician-visits.md), [walkthrough](operations/phase-6-local.md), [API contract](api/phase-6-openapi.json) and [completion checklist](plans/phase-6-checklist.md). Follow-up drafts, append-only findings, closure and pre-start cancellation/rescheduling are implemented. AWS remains deferred; CSV/reporting is Phase 7 and controlled-pilot operations is Phase 8.

Phase 7 adds [reviewed onboarding and descriptive reporting](architecture/0007-onboarding-and-reporting.md), [API contract](api/phase-7-openapi.json), [walkthrough](operations/phase-7-local.md), [CSV fixtures](examples/csv/README.md) and [completion checklist](plans/phase-7-checklist.md). Owners can import six datasets, export permitted records, inspect mature cohorts/current gaps and review paginated audit. AWS and the operational pilot gate remain deferred to Phase 8.

Phase 8 adds the [operating/recovery runbook](operations/phase-8-runbook.md) and [local verification record](plans/phase-8-checklist.md). The local foundation is verified separately from the remaining AWS, TLS, alert-delivery and pilot-partner gates.

Phase 9 adds [private manual ingestion and cited preparation](operations/phase-9-local.md), the [implemented API contract](api/phase-9-openapi.json) and [verification record](plans/phase-9-checklist.md). OpenAI key/model configuration and real paid-provider evaluation remain separate gates.

Phase 10 adds the [protected stock ledger and consumption walkthrough](operations/phase-10-local.md), [implemented stock API contract](api/phase-10-openapi.json) and [verification record](plans/phase-10-checklist.md). It extends the manual pilot with optional protected allocations; no live vendor integration is claimed.

The [frontend design record](design/frontend-redesign.md) describes the public website, blue design system, role-aware navigation, accessibility behavior and original image provenance.

The [hosted release roadmap](operations/launch-roadmap.md) records the free-only Mumbai account setup path, staging audit, secrets and hosted-test gates, real GitHub deployments, demo recording and discovery sequence.

The [Render and Vercel deployment assessment](operations/render-readiness.md) covers free-tier gaps, same-origin API routing, genuine GitHub deployment checkmarks and the hosted scenario acceptance matrix. No deployment is claimed by that plan.
