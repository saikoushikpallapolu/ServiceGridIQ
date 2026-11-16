# Contributing

Phase 1 local implementation is underway; authentication and business functionality remain later phases. Read the [current blueprint](docs/architecture/ServiceGrid_IQ_Build_Blueprint_v2.md), [build plan](docs/plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.md), and [Phase 1 checklist](docs/plans/phase-1-checklist.md) before changing application scope.

## Workflow

1. Choose one small task from the current phase and describe its acceptance criteria.
2. Record architectural decisions and meaningful departures from the blueprint.
3. Implement the smallest complete workflow, with migrations and contract updates where applicable.
4. Run relevant checks. Include authorization, tenant isolation, transaction, and concurrency cases when the feature requires them.
5. Update setup instructions and feature status to reflect what actually works.
6. Submit a reviewable commit or pull request with actual validation evidence and limitations.

Use a branch such as `feat/phase-1-foundation` for implementation. Do not introduce microservices, orchestration, AI, or live integrations simply to broaden the stack.

## Current verification

```sh
node scripts/check-docs.mjs
```

Run `pnpm build`, `pnpm typecheck`, `pnpm lint` and `pnpm test`. PostgreSQL integration checks require migration and seed; see docs/operations/local-development.md. Passing the documentation check does not mean application requirements have been implemented.

## Sensitive data and licensing

Never commit credentials, private client data, proprietary manuals, production exports, or database backups. Environment examples contain placeholders only. Confirm document rights before ingestion.

The owner selected the MIT license. Contributions must be compatible with LICENSE; never contribute material you do not have rights to distribute.
