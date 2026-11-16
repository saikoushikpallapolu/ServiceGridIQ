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

The repository now includes the Phase 1 frontend, health API, PostgreSQL foundation migration and seeds, local Docker services, CI, and AWS staging templates. Phase 2 adds local OIDC authentication, server-side sessions, company selection, roles, invitations and audit. Phase 3 implements customer/site/equipment records and versioned draft intake, job filtering, triage, timeline and equipment history. Scheduling and later pilot modules remain planned. The pilot OpenAPI file remains a future contract; the implemented authentication subset has its own contract. The owner explicitly deferred AWS staging to continue local development through Phase 3. See [local setup](operations/local-development.md), [AWS setup](operations/aws-staging.md), and [accepted decisions](architecture/0001-phase-1-foundation.md).

The [Phase 2 checklist](plans/phase-2-checklist.md) tracks current authentication completion.

The [Phase 3 checklist](plans/phase-3-checklist.md) tracks intake completion and its separate staging gate.

Phase 4 adds [technician skills and availability](architecture/0004-scheduling-foundation.md), an [implemented API contract](api/phase-4-openapi.json) and a [local walkthrough](operations/phase-4-local.md). The owner explicitly deferred AWS again to continue locally; the previous recommendation to deploy before Phase 4 is superseded.
