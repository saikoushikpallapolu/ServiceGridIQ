# Render deployment assessment and acceptance plan

Reviewed 2026-11-17. Render is being considered as an alternative to AWS for a public fictional-data demo. The standing constraint is no unapproved spending. No Render resources have been created; account access, plan selection and live OpenAI configuration remain unconfirmed.

## Platform constraints

According to [Render's free-instance documentation](https://render.com/docs/free), free web services can spin down after inactivity, free Postgres expires after 30 days, free Key Value is in-memory and restartable, and free services cannot attach persistent disks. Background workers are not a free instance type. A workspace's free plan does not make every service free. Review bandwidth/build usage as well as compute before enabling billing.

The full application needs web/API hosting, PostgreSQL with the required extensions, a worker, Redis-compatible queueing, private durable document storage and suitable OIDC identity. Free-only deployment must have an explicitly agreed feature scope and data-expiry plan. It must not be described as the complete hosted product if ingestion or storage is unavailable.

## Existing-code deployment gaps

- `apps/web/nginx.conf` resolves `api:3001` through Docker's internal resolver. Separate Render services do not reproduce this Compose network automatically. Choose and test a same-origin application serving/proxy design before releasing.
- Local Keycloak development mode is not the public identity setup. Configure HTTPS origins, issuer/client credentials, verified-email behavior, exact callbacks and logout URLs with a suitable hosted provider.
- Supply credentials only through server-side secret configuration. Configure the worker separately and keep document objects private; ephemeral application filesystem storage is unsuitable for manuals.
- Verify PostgreSQL version/extensions, migrations and connection limits for the selected datastore. Define backup and restore handling before relying on it.
- Existing local browser tests use local identity fixtures. Adapt hosted identity setup and permitted origin handling; do not upload local credential files.
- Keep AWS release configuration separate. A Render deployment must report its own actual release and test results.

## Proposed sequence

1. Configure and evaluate OpenAI locally only when API credits and a locally entered key are available. Local cited search remains available without it.
2. Test the scenario matrix below locally now; retain results and any defects. Hosting need not delay testing.
3. Confirm free-only demo scope or review the complete Render service estimate. Include identity/storage providers and their limits. No paid provisioning before approval.
4. Prepare the Render configuration, same-origin routing, server-side secrets, identity, migrations, fictional fixtures and recovery/reset procedure.
5. Create a GitHub `staging` environment with deployment protection appropriate to the repository plan. Deploy the exact CI-verified commit; wait for platform readiness and application acceptance checks.
6. Record the real deployment URL/status using GitHub environment deployments. A successful build or a deploy-hook HTTP response is not proof that the app is healthy.
7. Run hosted acceptance on desktop and a real phone. Record differences from the local environment, including cold starts and any unavailable features.
8. Promote an approved fictional-data demo to a separate `production` environment. Use `preview` only for actual temporary preview deployments with isolated data/secrets and a teardown policy.
9. Record the final walkthrough and begin company demos/discovery. Genuine customer onboarding remains subject to security and operating checks.

## Scenario matrix

These are planned targeted acceptance scenarios, not a claim that new hosted tests have run. Existing CI evidence remains documented separately.

| Area | Scenarios | Acceptance |
| --- | --- | --- |
| Identity and roles | Owner, dispatcher, technician, wrong company, disabled membership, withdrawn assignment | Authorized access only; stale access rejected |
| Intake | Complete request, missing required field, invalid dates, stale edit, no search results | Clear validation; failed input retained; no stale overwrite |
| Preparation | Required vs suspected parts, expired/manual evidence, unmet prerequisite, changed policy | Blockers/warnings remain distinct; approval revalidates current state |
| Scheduling | Unqualified technician, shift boundary, travel overlap, reschedule | Eligibility explanations; no conflicting assignment |
| Stock | Last-item race, partial/full consumption, duplicate retry, excess return, physical count below reservations | Protected quantities and ledger remain consistent |
| Visits | Acknowledge/start, invalid transition, closure review, follow-up, cancellation | Correct state changes and unused-allocation release |
| Knowledge | Allowed manual, wrong model, quarantine, revoke/reindex, extraction failure | Only authorized current evidence is retrievable |
| Live AI | Relevant/absent answer, fabricated-citation attempt, source prompt injection, missing consent, provider failure and budget exhaustion | Validated quotations or labelled fallback; no operational writes |
| Reliability | Lost response, worker restart, datastore outage, platform cold start, expired demo database | Honest errors; recoverable state; documented reset/expiry procedure |
| Mobile | Narrow viewport, long text, drawer/keyboard behavior, actual phone over HTTPS | Usable controls and authorized end-to-end workflow |
| Recovery | Database and document restoration, compatible image recovery | Reconciled operational data and working cited source retrieval |

## Decisions pending

- Free-only limited demo, approved full-stack hosting budget, or complete local demonstration.
- Render account and datastore/storage/identity selections.
- Live OpenAI credits and local key setup; provider usage is billed separately from hosting.

## Vercel frontend with Render API

This split is technically supported. Vercel can serve the Vite build and [proxy external API requests using rewrites](https://vercel.com/docs/routing/rewrites). Keep browser requests same-origin: browser -> Vercel `/api/...` -> Render `/api/...`. Preserve the API path prefix, authentication cookies, request bodies and origin checks; disable caching for authenticated API responses and verify supported payload sizes/timeouts.

Set the API `PUBLIC_ORIGIN` to the selected stable HTTPS frontend origin and register its exact `/api/auth/callback` and logout URLs with the hosted identity provider. Keep `AUTH_MODE=oidc`. Never expose OIDC client secrets or OpenAI keys through Vite environment variables. Preview URLs require a separate identity/return-URL strategy; do not blindly authorize arbitrary preview origins.

This topology does not replace PostgreSQL, Redis, the worker, private object storage or identity. It also does not make the full stack free. [Vercel Hobby](https://vercel.com/docs/plans/hobby) is restricted to personal/non-commercial usage; evaluate the intended business-demo use against its terms or confirm eligibility with Vercel before selecting that plan. Commercial use may require a paid plan. An alternative is to host the frontend with the API on Render, avoiding a second frontend platform, subject to its own limits and the same full-stack requirements.

### Real GitHub deployment checkmarks

The [Vercel GitHub integration](https://vercel.com/docs/git/vercel-for-github) uses GitHub's Deployments API. After importing the actual repository, configuring the monorepo build, deploying successfully and permitting the integration to report deployments, inspect the repository's deployment history. Production and Preview represent actual Vercel releases; the current GitHub UI determines their sidebar presentation.

A frontend build success proves the frontend was deployed, not that the API, identity, storage and worker work. Keep full-product staging acceptance as a separate gate. A GitHub Actions deployment job can declare its real environment name and URL and finish only after the provider release and hosted checks succeed. Backend automation must wait for Render's actual deploy completion; a deploy-hook acceptance response is insufficient. Never add placeholder successes just to obtain checkmarks.

### API key handoff

Create a dedicated project in the OpenAI API platform, review credits/billing, then open project settings -> API Keys -> Create new secret key. Restrict permissions to the required Responses/embedding requests where available. Enter the key locally in the ignored root `.env` as `OPENAI_API_KEY`, alongside a verified `OPENAI_SUMMARY_MODEL`. Recreate API/worker containers to apply it. When hosted, enter the key through server-side platform secret settings. Do not send it in chat. If a key has been exposed, revoke it and create a replacement. See the [knowledge walkthrough](phase-9-local.md).

See the [hosted release roadmap](launch-roadmap.md) for account, secrets, identity and operating gates that also apply when Render replaces AWS.
