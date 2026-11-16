# Phase 8 operating and recovery runbook

The local operating foundation is implemented. This is **not a production/pilot sign-off**: AWS account/budget, managed OIDC, public TLS, off-host encrypted backup custody, alert delivery, named support owner, pilot partner and observed shadow-mode usage remain external gates. Never substitute local Keycloak development mode for production identity. Responsive technician screens are the mobile web app; a native/offline app is not included.

## Release and rollback

Use reviewed CI artifacts and immutable commit-tagged ECR images through the existing manual AWS workflow. Review account, region and costs before creating resources. Production and staging must use distinct databases, identities, secrets and storage. Managed OIDC configuration rejects non-HTTPS origins; terminate TLS at the approved hosting edge. No public deployment was performed in this phase.

Run `node scripts/release-drill.mjs` against the working local Compose stack. It records exact API/web image IDs and recreates those images without rebuilding or running migrations. Its scope is same-version recovery, not proof that a future schema works with an older application. For a real rollback, pin the last compatible image coordinates, retain an encrypted pre-change backup and deploy compatible expand/contract migrations. Never edit applied migrations or automatically run destructive down migrations. If incompatible, stop writes and restore into a separate database, verify it and explicitly switch connections after approval.

## Backups and recovery

Run `node scripts/recovery-drill.mjs` from the repository root during a quiet period. It creates an authenticated AES-256-GCM encrypted custom-format PostgreSQL archive, verifies tamper rejection, restores into a newly named isolated database, compares migration/customer/job/audit counts and drops only that isolated rehearsal database. It never overwrites the live database or writes a plaintext dump. Results and encrypted archives are ignored under `.data`. The separate local key is `.data/backup-encryption.key`; losing it makes archives unusable. This colocated key is a local rehearsal convenience, not production key custody. Store real backups off-host with separate KMS-managed key access and verify scheduled restoration before accepting pilot data.

This database drill includes job, tenant, audit and import provenance. Keycloak identities and later uploaded objects need their own recovery procedures. Initial pilot proposals: daily encrypted backup, seven daily/ four weekly retained copies, recovery point <=24 hours and recovery time <=4 hours. These are **unproven targets**, not SLAs; record actual backup age and timed restores. Database expiry and backup retention are separate policies.

## Monitoring and incidents

Set a random `OPS_METRICS_TOKEN` of at least 32 characters in the API's secret configuration. `GET /internal/metrics` requires `Authorization: Bearer <token>` and is disabled without it. Scrape on the private network only; the public Nginx app does not proxy this path. Metrics are aggregate counts, server errors, rate-limit responses, request latency histogram, inflight requests process RSS, database size, active database connections and configured connection capacity. They contain no URL/query/user/tenant labels. See [alert rules](../../infrastructure/monitoring/alerts.yml); connect the rules to the approved monitoring stack and a real notification recipient before hosting. Readiness checks separately test PostgreSQL.

Watch database size, active connections and max connections with approved DBA monitoring (`pg_database_size`, `pg_stat_activity`, `max_connections`); do not expose cluster metadata to ordinary company users. Investigate 5xx/error-rate or readiness alerts using server-generated request IDs and safe container logs. Keep credentials, raw requests and uploaded files out of logs. On suspected isolation failure, stop affected access, preserve audit/backup evidence and notify the designated owner. On provider/worker failure keep manual dispatch available; never invent successful AI output.

## Load and shadow-mode gates

Run `node scripts/run-load.mjs` with local `.env` and Docker running. It creates and removes an isolated fictional company with 10,000 jobs and 10 authenticated dispatcher sessions, making 300 filtered-queue requests at concurrency 10. It leaves rate limits enabled, reports status counts/p50/p95 and fails if any request is not 200 or p95 reaches 500ms. This is **one read workload on the local host**, not capacity certification for all endpoints, writes, reports or cloud infrastructure. Use separate representative write/concurrency tests and real staging measurements before launch.

Before a partner uses the app: nominate support and data owners; obtain permitted sample records; agree service hours and limitations; rehearse customer→preparation→assignment→visit→follow-up on desktop and mobile; confirm least privilege; run recommendations in shadow mode with a dispatcher making final decisions; record disagreement, burden and missing data. No partner onboarding or real operational benefit is claimed by automated tests.
