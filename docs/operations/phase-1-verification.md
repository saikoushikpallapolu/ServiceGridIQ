# Phase 1 verification evidence

Verified locally on 16 November 2026 using Windows, Node.js 24.19.0, pnpm 11.25.0 and Docker Desktop with its Linux engine running.

## Checks executed successfully

- `pnpm install` and Prisma client generation using the committed dependency versions.
- `pnpm build`: contracts, API TypeScript compilation and production Vite frontend build.
- `pnpm typecheck`: shared contracts, application source, seed and test source.
- `pnpm lint`.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities after updating Prisma to 7.10.1, which replaces the affected deepmerge-ts and mysql2 dependencies.
- Native `pnpm dev` startup verified: frontend on port 5173 and API readiness on port 3001. Development servers were stopped after the check; full Docker remains running.
- `pnpm test`: five tests covering health behavior, dependency timeout, safe errors, request IDs and environment validation.
- `pnpm db:migrate`: initial Organization table migration applied to real PostgreSQL.
- `pnpm db:seed` executed twice successfully; the two fictional records are not duplicated.
- `pnpm test:integration`: one real PostgreSQL/API integration test passed.
- `pnpm check:docs`: local document links and pilot API references checked.
- Full Compose image builds and dependency-aware startup completed; database, API and frontend became healthy.
- `pnpm smoke`: frontend, API liveness, API readiness and database connectivity passed through Nginx.
- Database outage drill: stopping PostgreSQL left liveness at 200 and changed readiness to 503; restarting it restored successful smoke checks.
- An isolated headless Edge session verified desktop and 390-pixel mobile layouts, no horizontal overflow, the refresh action, degraded database display and network-error state, with no uncaught browser errors.
- The served frontend includes Content-Security-Policy after correcting Nginx header inheritance.
- `.env` and `apps/api/.env` are ignored by Git; setup generates local credentials without printing them.

## Pending evidence

- GitHub application CI and fresh-checkout results will be recorded after the implementation is pushed.
- CloudFormation schema lint passed using cfn-lint. Deployment-script shell syntax passed inside the Linux image. These checks do not verify AWS provisioning or live deployment.
- AWS account, region, budget approval and access are not configured. No infrastructure has been created; there is no staging deployment to verify yet.

This is a foundation release. It does not establish tenant authorization, business API coverage, production readiness or measured customer benefit.
