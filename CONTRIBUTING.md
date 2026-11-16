# Contributing

Implementation has not started. Read the [current blueprint](docs/architecture/ServiceGrid_IQ_Build_Blueprint_v2.md), [build plan](docs/plans/ServiceGrid_IQ_Phase_Wise_Build_Plan.md), and [Phase 1 checklist](docs/plans/phase-1-checklist.md) before changing application scope.

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

Application build and test commands do not exist yet. Phase 1 will establish them and add application CI gates. Passing the documentation check does not mean application requirements have been implemented.

## Sensitive data and licensing

Never commit credentials, private client data, proprietary manuals, production exports, or database backups. Environment examples contain placeholders only. Confirm document rights before ingestion.

No software license has been selected. Resolve licensing and contribution terms before accepting external code contributions.
