# Phase 2 local sign in

AWS staging is explicitly deferred. All steps below use your computer and Docker Desktop; no external identity account or cloud payment is needed.

## Start the full application

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 240
docker compose --env-file .env -f infrastructure/compose.yaml run --rm migrate pnpm --filter @servicegrid/api db:seed
```

Open [http://localhost:8080](http://localhost:8080) using localhost, not the numeric IP, for sign-in. Click Sign in; the browser opens the local Keycloak login page at port 8082 and returns to the application. Choose a company after signing in.

## Local accounts

The generated passwords are in `.data/local-accounts.json` on your computer. They are random, not stored in Git, not printed by setup and not baked into images. These are fictional development identities, not client accounts. Keycloak's read-only realm import contains these same credentials and is readable by its container UID. Keep the entire .data directory private and ignored.

| Email | Company access |
| --- | --- |
| owner.alpha@example.test | Owner in Fictional Cooling Alpha; dispatcher in Beta |
| dispatcher.alpha@example.test | Dispatcher in Alpha |
| technician.alpha@example.test | Technician in Alpha |
| owner.beta@example.test | Owner in Beta |
| new.member@example.test | No company access initially; usable for an invitation |

The Keycloak admin username is local-admin. Its separate random password is KEYCLOAK_ADMIN_PASSWORD in your ignored root .env. Do not publish either credential file. Setup preserves existing files. Keycloak imports a realm only on its first creation; changing import files does not silently change an existing realm or its passwords.

## What to try

1. Sign in as the Alpha owner and open Alpha. Review members, change a non-owner role, or create an invitation link.
2. Switch to Beta. That same identity has dispatcher permissions there, so owner tools disappear and owner-only API calls are denied.
3. Sign out and confirm Logout on the provider page. Sign in as the technician; only Alpha is listed.
4. Invite new.member@example.test to Alpha. Open that link and sign in with the matching local account. Accept the invitation and select Alpha. No email is sent automatically.
5. Try disabling the only active owner; the server rejects it. Revoking another member's access affects their next scoped request even if they still have a session.

Invitation links use URL fragments; the app preserves a pending link in sessionStorage during sign-in and clears it after acceptance/logout. Do not share links outside the intended recipient. An invitation grants access only after matching verified-email sign-in.

## Native development

```sh
docker compose --env-file .env -f infrastructure/compose.yaml up -d db identity
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). Native API environment uses PUBLIC_ORIGIN=http://localhost:5173. Docker uses http://localhost:8080. Cookies share the localhost host across ports, so avoid using native and full-Docker workspaces in the same browser session; sign out or use separate browser contexts when switching.

## Checks

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm audit --prod --audit-level high
pnpm check:docs
pnpm smoke
pnpm exec playwright install chromium
pnpm test:browser
```

API integration tests need migrated PostgreSQL. Browser tests need the full Docker stack and fictional local seed. On Linux CI, install browser system dependencies with `pnpm exec playwright install --with-deps chromium`. On Windows, an installed Edge can be used by setting PLAYWRIGHT_CHANNEL=msedge. E2E_BASE_URL can point to the native origin when testing native development. Tests use temporary browser contexts; they do not use your personal browser profile.

## Operator company provisioning

For a new company outside the fictional seed, its intended owner must first sign in through the configured provider. An operator with database access can then run:

```sh
pnpm --filter @servicegrid/api db:provision-company --owner-user-id USER_UUID --name "Company name" --slug company-slug --timezone Asia/Kolkata
```

Replace USER_UUID with that already-verified user's database ID. This privileged CLI creates a new company, its first owner and an audit record atomically. It is not a public endpoint and never guesses identity from an email address. A duplicate slug fails instead of attaching an owner to an existing company. Only run it after reviewing the intended identity and company.

## Managed provider configuration

Use AUTH_MODE=oidc with PUBLIC_ORIGIN=https://your-approved-origin, OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET if the provider requires one. Configure the exact /api/auth/callback URI and logout origin in that provider. OIDC_INTERNAL_ORIGIN is forbidden in managed mode. Configure roles only in the application's membership records, never by trusting browser data or an email domain. Managed-provider provisioning and production validation are not completed by the local tests.
