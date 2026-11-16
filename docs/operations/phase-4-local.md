# Phase 4 local walkthrough

AWS staging remains explicitly deferred at the owner's request. Start Docker Desktop's Linux engine and use the [Phase 2 login guide](phase-2-local.md) for local passwords.

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 240
docker compose --env-file .env -f infrastructure/compose.yaml run --rm migrate pnpm --filter @servicegrid/api db:seed
```

The fourth migration adds scheduling tables and PostgreSQL exclusion constraints. It preserves existing intake records. Do not delete volumes or edit applied migrations.

## Demo eligibility

1. Open [localhost:8080](http://localhost:8080), sign in as dispatcher.alpha@example.test and choose Alpha.
2. Open the fictional bakery's demo job from the queue. If it is DRAFT, triage it. Open Appointment eligibility in its detail.
3. The demo has a main-branch requirement and a fictional cooling skill at level 2. If the policy is absent for a new job, select the branch and skill, then Save scheduling requirements.
4. For the demo, propose 1 December 2026 at 9 AM in Asia/Kolkata (03:30 UTC). The form labels your browser's zone; adapt the entry if your browser uses another zone.
5. Check technician eligibility. Alpha Technician should pass with the original fixtures. The fictional annex technician lacks the required qualification and belongs to another branch, and should show blockers.
6. Review travel start, arrival and work end separately. The result is a snapshot and does not book anyone.

## Workforce changes

- Find Technicians & availability below the intake panel. Choose a technician to inspect owner-verified evidence and recorded intervals.
- A dispatcher can add a SHIFT or UNAVAILABLE interval with a reason, or remove an interval. Try an unavailable period overlapping the proposed appointment, then check eligibility again. Remove the temporary interval afterwards.
- An owner can open Manage branches, skill catalog and technician profiles. Add a branch or skill, or create a profile for an existing active technician membership. Invitations create memberships in the Phase 2 access workflow.
- As owner, select a technician and record a skill level, evidence, optional expiry and verification/revocation status. A dispatcher cannot do this. Try a required level higher than the verified level or expiry before work ends; preview should explain the failure.
- A job can explicitly permit another company branch. This never grants access to another company's technician records.
- Changed requirements increment the job version. Stale policy/profile/availability changes fail with a reload instruction. Job-level previews refresh only when requested; they are never assignments.

This Phase 4 walkthrough describes the eligibility foundation. Phase 5 now adds the public readiness and approved-assignment workflow; follow the [current walkthrough](phase-5-local.md) for booking. No SQL insertion is needed to test the normal Phase 4 UI.

## Checks

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

On Windows, installed Edge can be used by setting PLAYWRIGHT_CHANNEL=msedge. Browser tests use fictional local credentials and add fictional skill/job records. They remove their temporary unavailable interval. Integration race tests use isolated companies and remove their fixtures. See the [design](../architecture/0004-scheduling-foundation.md) and [implemented contract](../api/phase-4-openapi.json).
