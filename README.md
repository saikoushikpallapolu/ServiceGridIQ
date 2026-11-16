# ServiceGrid IQ

**Dispatch readiness for HVAC service teams.**

ServiceGrid IQ is a field-service preparation tool that helps dispatchers identify missing job information, check technician eligibility, confirm required-part readiness, and approve assignments with clear explanations. Technicians receive preparation cards and record visit outcomes, including linked follow-ups.

**Status: Phases 1–10 implemented locally; hosted pilot gates and real paid-provider evaluation remain open.** Core dispatch, visits, CSV onboarding and reporting are joined by local operations/recovery rehearsals (Phase 8), private reviewed manuals and cited evidence with optional OpenAI integration (Phase 9), and protected stock reservations/consumption (Phase 10). Add your own OpenAI key/model locally before evaluating AI output. AWS remains deferred.

![ServiceGrid IQ public website](docs/design/previews/landing-desktop.png)

## The problem we are testing

A technician may arrive without useful equipment information, the required qualification, or confirmation of a needed part. The product hypothesis is that an explicit preparation workflow can catch some of these gaps before dispatch and help teams understand why follow-up visits occur.

The initial candidate customer is a commercial HVAC or AC maintenance company with approximately 5–30 technicians. Customer demand, pricing, and operational benefit still need validation.

## Planned pilot workflow

1. Create or import a customer, site, equipment record, and service job.
2. Review missing information, mandatory prerequisites, and parts evidence.
3. Compare eligible technicians using explainable, deterministic ranking.
4. Have a dispatcher approve the assignment after server-side revalidation.
5. Let the assigned technician acknowledge, start, and close the visit.
6. Create a linked follow-up when needed and review its recorded reason.

MANUAL parts confirmation remains the default. Owners can enable **LEDGER mode** for protected required-part allocations and actual consumption; existing manual assignments retain their mode. Private reviewed manuals provide cited preparation evidence. The app is online-only responsive web, including the technician experience; native/offline mobile is not implemented.

## Documentation

| Document | Purpose |
| --- | --- |
| [Build blueprint v2 — Markdown](docs/architecture/ServiceGrid_IQ_Build_Blueprint_v2.md) · [PDF](docs/architecture/ServiceGrid_IQ_Build_Blueprint_v2.pdf) | Product boundaries, policies, lifecycle, data model, architecture, security, and acceptance criteria |
| [Phase-wise build plan — Markdown](docs/plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.md) · [PDF](docs/plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.pdf) | Detailed tasks, estimates, completion gates, and extension phases |
| [Pilot OpenAPI contract](docs/api/ServiceGrid_IQ_Pilot_OpenAPI_v2.json) | Original proposed contract; implemented phase contracts below take precedence |
| [Phase 2 API contract](docs/api/phase-2-openapi.json) | Implemented OIDC/session, membership, invitation and audit endpoints |
| [Frontend design](docs/design/frontend-redesign.md) | Blue design system, public landing page, role-aware workspace navigation and mobile layouts |
| [Phase 10 stock API](docs/api/phase-10-openapi.json) · [walkthrough](docs/operations/phase-10-local.md) · [verification](docs/plans/phase-10-checklist.md) | Optional protected inventory, actual consumption, returns and reconciliation |
| [Phase 9 knowledge API](docs/api/phase-9-openapi.json) · [walkthrough](docs/operations/phase-9-local.md) | Private manual review, ingestion, cited retrieval and optional OpenAI configuration |
| [Phase 8 runbook](docs/operations/phase-8-runbook.md) · [verification](docs/plans/phase-8-checklist.md) | Local recovery, monitoring and load evidence; remaining hosted pilot gates |
| [Phase 7 API contract](docs/api/phase-7-openapi.json) | Implemented CSV reviews/commits, exports, reporting and audit |
| [Phase 7 walkthrough](docs/operations/phase-7-local.md) · [checklist](docs/plans/phase-7-checklist.md) | Load fictional records and inspect operational results |
| [Phase 6 API contract](docs/api/phase-6-openapi.json) | Implemented technician visits, outcomes, follow-ups and lifecycle actions |
| [Phase 6 walkthrough](docs/operations/phase-6-local.md) · [checklist](docs/plans/phase-6-checklist.md) | Try the complete local dispatcher-to-technician workflow |
| [Phase 5 API contract](docs/api/phase-5-openapi.json) | Implemented preparation, live readiness, ranking and approved assignment |
| [Phase 5 walkthrough](docs/operations/phase-5-local.md) · [checklist](docs/plans/phase-5-checklist.md) | Prepare a job, resolve gaps and approve an eligible technician |
| [Phase 4 API contract](docs/api/phase-4-openapi.json) | Implemented workforce, scheduling policy and eligibility endpoints |
| [Phase 4 walkthrough](docs/operations/phase-4-local.md) · [checklist](docs/plans/phase-4-checklist.md) | Try qualification verification, availability and appointment checks |
| [Phase 3 API contract](docs/api/phase-3-openapi.json) | Implemented customer, site, equipment and job-intake endpoints |
| [Phase 3 checklist](docs/plans/phase-3-checklist.md) | Local completion evidence and remaining deployment gate |
| [Phase 3 walkthrough](docs/operations/phase-3-local.md) | Try customer-to-job intake, triage and edit conflicts |
| [Phase 2 checklist](docs/plans/phase-2-checklist.md) | Local completion evidence and deferred deployment boundaries |
| [Phase 1 checklist](docs/plans/phase-1-checklist.md) | Immediate implementation tasks and completion evidence |
| [Documentation index](docs/README.md) | Reading order and source-of-truth rules |
| [Original blueprint v1 — archived PDF](docs/archive/ServiceGrid_IQ_Product_and_Engineering_Blueprint.pdf) | Historical reference; v2 supersedes it for new implementation decisions |

## Stack

| Area | Baseline |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| API | Node.js, TypeScript, Express, Zod |
| Database | PostgreSQL, Prisma, reviewed SQL for database-specific constraints |
| Local environment | Docker Compose |
| Delivery | GitHub Actions, versioned container images, staging before production |
| Later asynchronous work | Redis and BullMQ when document ingestion or sustained background tasks require them |
| Later document knowledge | Private S3-compatible storage, pgvector, PostgreSQL full-text search, provider adapters |

Node.js 24.19.0 and pnpm 11.25.0 are pinned. Prisma 7.10.1 and PostgreSQL 17 are used with a committed lockfile. See [Phase 1 decisions](docs/architecture/0001-phase-1-foundation.md). Local sign-in uses Keycloak and OIDC server-side sessions. See [authentication decisions](docs/architecture/0002-authentication-and-tenancy.md). AWS staging is prepared but explicitly deferred.

## Repository layout

```text
apps/
  web/                  # React dispatcher and technician workspaces
  api/                  # Express identity, intake, preparation and visit APIs
  worker/               # Reserved for later asynchronous processing
packages/
  contracts/            # Shared runtime schemas and TypeScript types
infrastructure/         # Local Compose and prepared AWS staging configuration
docs/
  architecture/         # Current product and engineering blueprint
  api/                  # Pilot OpenAPI contract
  plans/                # Schedule and implementation checklist
  operations/           # Deployment and recovery documentation as implemented
  security/             # Security boundaries and future threat model
  archive/              # Superseded source documents
scripts/                # Setup, smoke, documentation and deployment helpers
.github/workflows/      # Documentation, application CI and manual AWS release
```

The web, API, contracts, local Compose stack with Keycloak, and AWS staging configuration now contain implementation. The worker directory remains reserved for a later phase.

## Getting started

```sh
git clone https://github.com/saikoushikpallapolu/ServiceGridIQ.git
cd ServiceGridIQ
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 180
docker compose --env-file .env -f infrastructure/compose.yaml run --rm migrate pnpm --filter @servicegrid/api db:seed
pnpm smoke
```

Open [http://localhost:8080](http://localhost:8080). Docker Desktop must be running. See [local development](docs/operations/local-development.md) for hot reload, seeds, tests, logs, and safe shutdown. See [AWS setup for beginners](docs/operations/aws-staging.md) for account and staging steps. Click Sign in and use a generated fictional account from your ignored `.data/local-accounts.json`. See the [Phase 2 sign-in guide](docs/operations/phase-2-local.md). Use localhost for browser sign-in. The identity container is development-only; no public cloud identity provider is configured.

The documentation check requires Node.js 22 or later and no package installation. It checks required files, local Markdown links, JSON parsing, local OpenAPI references, and operation IDs. It is not a full OpenAPI validator or application test suite.

Track remaining deployment evidence in the [Phase 1 checklist](docs/plans/phase-1-checklist.md) , [Phase 2 checklist](docs/plans/phase-2-checklist.md) and [Phase 3 checklist](docs/plans/phase-3-checklist.md). CI builds, checks types/lint, runs unit and PostgreSQL integration tests, smoke-tests the Docker stack, and runs real OIDC browser checks. AWS release is a separate manual workflow requiring account configuration and approval.

## Delivery plan

| Phase | Outcome | Estimated hours |
| --- | --- | --- |
| 1 | Project setup and first staging deployment | 12–18 |
| 2 | Authentication and company isolation | 18–26 |
| 3 | Customers, equipment, and service intake | 20–28 |
| 4 | Technician skills and availability | 18–26 |
| 5 | Readiness checks and approved assignment | 26–36 |
| 6 | Technician workflow and follow-up tracking | 22–30 |
| 7 | CSV onboarding and basic reporting | 20–28 |
| 8 | Operational pilot readiness | 24–36 |
| 9 | Optional cited AI preparation | Additional 35–55 |
| 10 | Optional transactional inventory | Additional 30–50; integrations estimated separately |

Allow approximately **180–260 focused hours including contingency** for Phases 1–8, or approximately **8–11 weeks at 25 hours per week**. These are estimates, not delivery commitments. Conduct customer discovery alongside the early phases and make extensions conditional on evidence.

## Engineering rules

- Enforce company and role authorization on the server, including workers, exports, and document retrieval.
- Keep dispatch human-approved and ranking deterministic.
- Protect assignment and stock invariants with transactions and appropriate database constraints.
- Keep AI advisory; it cannot directly assign technicians or mutate inventory.
- Use fictional public demo data and keep credentials, private manuals, and customer exports out of Git history.
- Record executed checks and known limitations. Do not represent planned functionality as shipped.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the implementation workflow.

## Licensing

This project is licensed under the [MIT License](LICENSE), as selected by the owner. It permits commercial reuse and redistribution under its terms. Proprietary customer data and third-party manuals are not licensed by this repository.
