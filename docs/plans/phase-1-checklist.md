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

The checklist above describes files present in the repository. A workflow definition is not evidence of a successful GitHub Actions run.

## Decisions before implementation

- [ ] Select and pin supported Node.js and package-manager versions.
- [ ] Record the workspace/package strategy and lockfile policy.
- [ ] Confirm the PostgreSQL version and Prisma migration approach.
- [ ] Select the managed identity provider for Phase 2.
- [ ] Select staging hosting, container registry, database location, region, and budget.
- [ ] Decide licensing before external contributions or distribution.

## Foundation tasks

- [ ] Building workspace manifests for the frontend, API, and shared contracts.
- [ ] Building the React, TypeScript, and Vite frontend foundation.
- [ ] Building the Express and TypeScript API with Zod validation and consistent errors.
- [ ] Building liveness and dependency-aware readiness endpoints.
- [ ] Building structured logging with correlation IDs and safe error handling.
- [ ] Building PostgreSQL local services using Docker Compose.
- [ ] Building the first reviewed migration and fictional seed data.
- [ ] Building placeholder-only environment examples and documented setup commands.
- [ ] Building versioned frontend and API containers.
- [ ] Building application CI for type checks, lint, focused tests, and builds.
- [ ] Deploying the initial application to staging and verifying database connectivity.
- [ ] Documenting actual local start, stop, migration, seed, build, and verification commands.

Do not build workers, Redis ingestion, RAG, inventory reservations, or business-feature screens in this phase. Customer discovery can proceed alongside setup.

## Completion evidence

- [ ] Record a successful clean-clone setup.
- [ ] Record application check commands and their results.
- [ ] Link the successful CI run.
- [ ] Record the staging URL and deployed commit without exposing credentials.
- [ ] Verify readiness correctly reports database unavailability.
- [ ] Confirm no secrets or private client records are tracked.
- [ ] Update the README to distinguish implemented foundation from planned features.
