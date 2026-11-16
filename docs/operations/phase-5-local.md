# Phase 5 local walkthrough

Navigation: choose **Parts & locations** for the catalog, then **Dispatch** for job preparation, readiness and assignment approval. On mobile, use the workspace menu. See the [frontend navigation guide](../design/frontend-redesign.md).

AWS remains deferred. Run Docker Desktop's Linux engine and use the [local sign-in guide](phase-2-local.md) for generated fictional credentials.

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 240
docker compose --env-file .env -f infrastructure/compose.yaml run --rm migrate pnpm --filter @servicegrid/api db:seed
```

The fifth migration preserves earlier data and adds preparation/evidence/approval records. Do not delete volumes or edit applied migrations. Each company's local seed includes a fictional filter and stock location; it never invents a stock balance or a current confirmation.

## Prepare and approve a job

1. Open [localhost:8080](http://localhost:8080), sign in as owner.alpha@example.test or dispatcher.alpha@example.test, and select Alpha.
2. Create a service request, or choose an unassigned demo request, then triage it. Save its service branch and qualification policy in Appointment eligibility. The demo Alpha technician has the fictional cooling skill at level 2.
3. For the original demo shift, use 1 December 2026 at 9 AM in Asia/Kolkata (03:30 UTC). For other dates, add a matching shift under Technicians & availability. Avoid an already reserved interval.
4. Open Preparation & approved assignment. Save the visit arrival and explicitly check the parts review and safety/access review boxes. Times use the browser zone shown by the form.
5. Open Parts requirements and confirmations. Add the fictional filter from Fictional stores with a positive quantity, REQUIRED state and classification reason. The readiness result blocks until you record CONFIRMED availability with a note.
6. Add a mandatory SAFETY or ACCESS prerequisite with an uppercase code, label and rationale. Confirm its evidence as PASS. Unknown/failed mandatory evidence cannot be bypassed or deleted.
7. Inspect Current readiness. SUSPECTED parts without current positive evidence need an explicit warning acknowledgment; REQUIRED parts always block. Changing a requirement or visit invalidates corresponding earlier confirmations.
8. When checks allow it, Mark job ready. Compare ranked technicians and inspect weighted contributions, booked/available minutes and missing-history flags.
9. Select an eligible technician, review the saved travel/arrival/end times, give an approval reason and Approve assignment. The job becomes ASSIGNED and displays who approved it and the reserved technician interval.
10. Ordinary preparation edits are now locked. Continue with the [Phase 6 walkthrough](phase-6-local.md) for technician acknowledgment, execution, cancellation and rescheduling.

Parts are manually confirmed, not reserved. Do not treat this workflow as inventory accounting or a guarantee that a part will remain available until the visit.

## Catalog and freshness

Parts & stock locations appears below workforce. Owners and dispatchers can add catalog parts and BRANCH/VAN locations. Only owners can change the manual-confirmation lifetime, from 1 to 168 hours. Policy changes require READY jobs to be marked ready again before assignment.

No outbox delivery is configured: approval records a pending event transactionally, but sends no email or external notification.

## Verification

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

On Windows, set PLAYWRIGHT_CHANNEL=msedge to use installed Edge. Browser tests use fictional accounts, create their own fictional future shift days/jobs and retain approved demonstration assignments; they do not delete your existing records. Their temporary lost-response interception exists only in the automated test browser. Integration tests use isolated companies and remove their own fixtures.

See [design decisions](../architecture/0005-readiness-and-assignment.md), [implemented API](../api/phase-5-openapi.json) and [completion checklist](../plans/phase-5-checklist.md).
