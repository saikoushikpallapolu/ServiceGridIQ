# Phase 6 local walkthrough

Navigation: technicians work in **My visits**. Owners and dispatchers choose **Dispatch** to open a job and manage its visit lifecycle. On mobile, use the workspace menu. See the [frontend navigation guide](../design/frontend-redesign.md).

The core service workflow now works locally. [Phase 7](phase-7-local.md) now provides imports/exports and reporting; Phase 8 establishes hosted controlled-pilot readiness. AI/manual ingestion and transactional inventory are later optional extensions. AWS account setup remains deferred.

Use Docker Desktop's Linux engine and generated credentials from the [sign-in guide](phase-2-local.md).

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 240
docker compose --env-file .env -f infrastructure/compose.yaml run --rm migrate pnpm --filter @servicegrid/api db:seed
```

The sixth migration preserves existing jobs and approvals. Do not delete Docker volumes or edit applied migrations.

## Dispatcher → technician → follow-up

1. Open [localhost:8080](http://localhost:8080). Sign in as owner.alpha@example.test or dispatcher.alpha@example.test. Follow the [Phase 5 walkthrough](phase-5-local.md) to approve a job for Alpha Technician.
2. In a separate browser profile/private window, sign in as technician.alpha@example.test and select Alpha. Open My service visits. Search the complaint if needed and open the assignment.
3. Review customer/site/equipment details, the approved preparation card and separately labelled current evidence freshness. A technician cannot browse the company's entire job queue or directory.
4. Acknowledge preparation, then Start visit. Actual timestamps are recorded independently of the planned interval. Starting another visit while one is in progress is rejected.
5. Record findings. Try a note, reported parts usage and a correction referencing an earlier observation. Usage is explicitly non-accounting; it does not deduct stock.
6. Open Close visit form. Choose Resolved and enter closure notes, or choose Follow-up required, provide a reason and a future arrival window. Closure releases time and preserves the original visit.
7. For unresolved closure, return to the dispatcher view and open Visit activity & lifecycle. Open linked follow-up. The child is a separate draft with parent/root references and copied requirements but no confirmations or assignment. Prepare and assign it again.
8. Switch the technician list to Closed and cancelled visits to review their own terminal visits and append an attributed annotation if needed.

Keep all data fictional. Local automated browser fixtures may include clearly labelled future shift days and approvals; these are demo records, not real appointments. Early starts are permitted for demonstration and operational flexibility; they do not rewrite the planned reservation.

## Cancellation and rescheduling

- In the dispatcher job detail, use Visit activity & lifecycle. Cancel request requires a reason and is terminal.
- Reschedule visit is available only before work starts. Give a new future window, duration/buffer and reason. The old assignment/time is released, technician access to that withdrawn assignment is revoked, and preparation returns to TRIAGED with old evidence invalidated.
- In-progress visits must be closed unresolved if another visit is needed. They cannot be cancelled or rescheduled through those controls.
- Closure notes/outcome cannot be rewritten. Append a note or correction to the recorded visit instead.

## Failure and stale-form checks

Type a visit note and try signing out, changing workspace or reloading the visit: a discard prompt should appear. Cancelling the prompt keeps the form. A failed request also keeps inputs; retry the same action rather than creating a new action key. On a version conflict, review your text and explicitly reload the latest visit. There is no offline queue or draft persistence after a forced browser shutdown.

## Verify

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm check:docs
pnpm smoke
pnpm test:browser
```

On Windows, set PLAYWRIGHT_CHANNEL=msedge for installed Edge. Browser tests use separate owner/technician contexts, fictional future slots and a test-only interrupted response. The scheduling browser group waits one rate-limit window before its owner-heavy checks, keeping the real application limits enabled. Integration fixtures are isolated and cleaned up. See [design decisions](../architecture/0006-technician-visits.md), [API contract](../api/phase-6-openapi.json) and [checklist](../plans/phase-6-checklist.md).
