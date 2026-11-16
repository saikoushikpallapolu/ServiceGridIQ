# ServiceGrid IQ

**Dispatch readiness for HVAC service teams.**

ServiceGrid IQ is a planned field-service preparation tool that helps dispatchers identify missing job information, check technician eligibility, confirm required-part readiness, and approve assignments with clear explanations. Technicians will receive preparation cards and record visit outcomes, including linked follow-ups.

**Status: planning and repository setup complete. Phase 1 implementation is next.** This repository currently contains specifications and a directory scaffold. It does not yet contain a running application, a deployed service, or validated customer results.

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

The pilot uses **timestamped manual parts confirmation**, not protected stock reservations. Transactional inventory and cited AI preparation are later extensions. The pilot will be online-only; a responsive technician interface does not imply offline support.

## Documentation

| Document | Purpose |
| --- | --- |
| [Build blueprint v2 — Markdown](docs/architecture/ServiceGrid_IQ_Build_Blueprint_v2.md) · [PDF](docs/architecture/ServiceGrid_IQ_Build_Blueprint_v2.pdf) | Product boundaries, policies, lifecycle, data model, architecture, security, and acceptance criteria |
| [Phase-wise build plan — Markdown](docs/plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.md) · [PDF](docs/plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.pdf) | Detailed tasks, estimates, completion gates, and extension phases |
| [Pilot OpenAPI contract](docs/api/ServiceGrid_IQ_Pilot_OpenAPI_v2.json) | OpenAPI 3.1 contract with 52 proposed operations; no backend implementation supplied |
| [Phase 1 checklist](docs/plans/phase-1-checklist.md) | Immediate implementation tasks and completion evidence |
| [Documentation index](docs/README.md) | Reading order and source-of-truth rules |
| [Original blueprint v1 — archived PDF](docs/archive/ServiceGrid_IQ_Product_and_Engineering_Blueprint.pdf) | Historical reference; v2 supersedes it for new implementation decisions |

## Planned stack

| Area | Baseline |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| API | Node.js, TypeScript, Express, Zod |
| Database | PostgreSQL, Prisma, reviewed SQL for database-specific constraints |
| Local environment | Docker Compose |
| Delivery | GitHub Actions, versioned container images, staging before production |
| Later asynchronous work | Redis and BullMQ when document ingestion or sustained background tasks require them |
| Later document knowledge | Private S3-compatible storage, pgvector, PostgreSQL full-text search, provider adapters |

Runtime versions, package-manager selection, authentication provider, and hosting target will be recorded during Phase 1. No dependencies have been installed yet.

## Repository layout

```text
apps/
  web/                  # Planned manager and technician interface
  api/                  # Planned modular backend
  worker/               # Reserved for later asynchronous processing
packages/
  contracts/            # Planned shared validation and API contracts
infrastructure/         # Planned Compose, deployment, and monitoring configuration
docs/
  architecture/         # Current product and engineering blueprint
  api/                  # Pilot OpenAPI contract
  plans/                # Schedule and implementation checklist
  operations/           # Deployment and recovery documentation as implemented
  security/             # Security boundaries and future threat model
  archive/              # Superseded source documents
scripts/                # Repository documentation checks
.github/workflows/      # Documentation checks; application CI comes in Phase 1
```

The application and infrastructure directories are placeholders. They do not indicate implemented features.

## Getting started

```sh
git clone https://github.com/saikoushikpallapolu/ServiceGridIQ.git
cd ServiceGridIQ
node scripts/check-docs.mjs
```

The documentation check requires Node.js 22 or later and no package installation. It checks required files, local Markdown links, JSON parsing, local OpenAPI references, and operation IDs. It is not a full OpenAPI validator or application test suite.

Next, follow the [Phase 1 checklist](docs/plans/phase-1-checklist.md). Application start, migration, and container commands will be documented when they exist and have been run successfully.

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

A software license has not yet been selected. Public repository visibility does not by itself grant an open-source license. Resolve the licensing choice before accepting external code contributions or distributing the application.
