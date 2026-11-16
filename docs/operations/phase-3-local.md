# Phase 3 local walkthrough

Use Docker Desktop with its Linux engine running. No AWS account is required. Follow the [Phase 2 sign-in guide](phase-2-local.md) for account setup and generated passwords.

## Start or update

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 240
docker compose --env-file .env -f infrastructure/compose.yaml run --rm migrate pnpm --filter @servicegrid/api db:seed
```

The migration adds five intake tables, enums, tenant-safe foreign keys and validation constraints without removing Phase 2 data. Do not edit applied migrations or delete Docker volumes to update the app. Fictional demo seeding preserves edits and existing access revocations. Each company receives a fictional bakery, site, equipment and draft request only in local identity seed mode.

## Try the workflow

1. Open [localhost:8080](http://localhost:8080), sign in as dispatcher.alpha@example.test or owner.alpha@example.test and select Alpha.
2. Find Dispatch workspace. Open Customers & equipment. Add a customer, then a service site and its equipment. The selections follow the new records. To correct an existing record, select it and use Edit selected customer/site/equipment.
3. Open New service request. Select the matching records, describe the complaint, choose priority and enter an arrival window. The form identifies the browser time zone. Enter work duration and travel buffer, then create the request.
4. The queue and detail show the new draft. Use Edit draft to correct it. Triage job marks intake as checked; it does not book a technician.
5. To correct triaged intake, provide a reason and Return to draft. Review the job timeline and other requests for its equipment.
6. Filter the queue by state or priority, or search a complaint, customer name or equipment serial. Pages contain ten rows.
7. Try two browser sessions editing the same draft. Saving the first changes its version; the other save is rejected and its form is retained. Reload latest job only after reviewing the warning.
8. The Alpha owner can switch to Beta, where the queue contains Beta records. A technician cannot see or call intake endpoints.

Local demo arrival dates are fictional examples, not scheduled appointments. Contact records, complaints and access notes should remain fictional until production identity, HTTPS, hosting and operational safeguards are configured.

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

Integration tests use temporary company fixtures in the migrated database. Browser tests use ignored fictional local credentials and create additional fictional records in Alpha. They do not delete existing jobs or master records. On Windows with Edge installed, set PLAYWRIGHT_CHANNEL=msedge before browser tests. See [design decisions](../architecture/0003-service-intake.md) for limits and transition rules.

## Next deployment gate

AWS staging remains deferred for this phase. Before Phase 4, agree the AWS region and budget, establish account access, deploy staging with HTTPS and a suitable identity configuration, then verify deployment and recovery separately. Do not publish the local development Keycloak container or credential files.
