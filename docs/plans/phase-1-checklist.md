# Phase 1 implementation checklist

**Goal:** A fresh clone runs the initial frontend and API locally, CI passes, and a staging deployment can reach PostgreSQL. Estimated implementation effort: 12–18 hours, subject to setup and hosting constraints.

## Repository preparation completed

- [x] Add current blueprint and editable source.
- [x] Add phase-wise plan and editable source.
- [x] Archive original blueprint separately.
- [x] Add pilot OpenAPI contract.
- [x] Add truthful README and directory scaffold.
- [x] Add ignore rules and editor settings.
- [x] Add document-validation script and CI workflow definition.

See [verification evidence](../operations/phase-1-verification.md) for executed local checks. AWS provisioning and deployment remain pending account setup and cost approval.

## Decisions before implementation

- [x] Select and pin supported Node.js and package-manager versions.
- [x] Record the workspace/package strategy and lockfile policy.
- [x] Confirm the PostgreSQL version and Prisma migration approach.
- [x] Select the Phase 2 OIDC design and local Keycloak provider; actual managed-provider provisioning remains deferred with AWS.
- [ ] Select staging hosting, container registry, database location, region, and budget.
- [x] Decide licensing before external contributions or distribution.

## Foundation tasks

- [x] Building workspace manifests for the frontend, API, and shared contracts.
- [x] Building the React, TypeScript, and Vite frontend foundation.
- [x] Building the Express and TypeScript API with Zod validation and consistent errors.
- [x] Building liveness and dependency-aware readiness endpoints.
- [x] Building structured logging with correlation IDs and safe error handling.
- [x] Building PostgreSQL local services using Docker Compose.
- [x] Building the first reviewed migration and fictional seed data.
- [x] Building placeholder-only environment examples and documented setup commands.
- [x] Building versioned frontend and API containers.
- [x] Building application CI for type checks, lint, focused tests, and builds.
- [ ] Deploying the initial application to staging and verifying database connectivity.
- [x] Documenting actual local start, stop, migration, seed, build, and verification commands.

Do not build workers, Redis ingestion, RAG, inventory reservations, or business-feature screens in this phase. Customer discovery can proceed alongside setup.

## Completion evidence

- [x] Record a successful clean-clone setup through the fresh Linux CI checkout and full Docker smoke test.
- [x] Record application check commands and their results.
- [x] Link the [successful application and infrastructure CI run](https://github.com/saikoushikpallapolu/ServiceGridIQ/actions/runs/43816268807).
- [ ] Record the staging URL and deployed commit without exposing credentials.
- [x] Verify readiness correctly reports database unavailability.
- [x] Confirm no secrets or private client records are tracked.
- [x] Update the README to distinguish implemented foundation from planned features.

## Accepted setup decisions

See [Phase 1 decisions](../architecture/0001-phase-1-foundation.md), [local setup](../operations/local-development.md), and [AWS account and staging guide](../operations/aws-staging.md). The project owner approved the baseline stack, AWS staging for learning, and MIT licensing. Local setup does not depend on AWS account creation.

The owner explicitly authorized proceeding with Phase 2 locally while AWS staging remains deferred on 16 November 2026. Phase 1 cloud deployment is still incomplete; this authorization changes sequencing, not its verification status.
