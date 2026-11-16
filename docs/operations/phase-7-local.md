# Phase 7 local walkthrough

Phase 7 adds owner onboarding, exports, operational reports and audit history to the working dispatcher/technician flow. AWS remains deferred; Phase 8 is the operational pilot gate. Use fictional data only in the development environment.

## Start the current app

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 240
```

The seventh migration adds provenance/review/exclusion tables and preserves existing operational records. Do not delete volumes or edit applied migrations. Open [localhost:8080](http://localhost:8080), sign in as owner.alpha@example.test using ignored `.data/local-accounts.json`, and select Alpha. See [sign-in](phase-2-local.md) and the [core workflow](phase-6-local.md).

## Review and commit CSVs

1. Open **Onboarding & reports → CSV onboarding**. Choose a dataset and download its template. All template columns are required; optional values can be empty. Default delimiter is a comma; use UTF-8 CSV.
2. Use one stable source name, such as `fictional-pilot`, across related datasets. Load customers → sites → equipment → jobs. Example fixture files are in [CSV examples](../examples/csv/README.md).
3. Choose a file and click **Run dry run**. It writes no domain records. Review create/unchanged/error counts, individual row errors, batch ID, file fingerprint and expiry. Optional custom mapping supports renamed headers with a JSON object such as `{"name":"Customer Name"}`.
4. Fix any error and run a new dry run. For a valid review, click **Commit reviewed import**. The whole dataset commits or none of it does. Do not assume a preview guarantees commit: references and membership eligibility are checked again.
5. After a network interruption, retry the same commit. The UI keeps the batch and action key; a committed batch cannot duplicate records. After a browser restart, paste its ID into **Resume import batch ID** and load the saved review as the same owner. Uncommitted reviews expire in 24 hours.
6. Reimport the identical external IDs/data: they should show unchanged and skip. Change a previously imported row: it should show a conflict, requiring review through the ordinary application workflow. Manual edits are preserved on identical reimport.
7. Reload company records/job queue to see committed data. Imported jobs are drafts; use triage, scheduling, preparation and approval separately.

Technician imports require an existing active technician membership without a profile. Invite the person first, then use **Technician membership and branch reference IDs** to obtain IDs for the file. Skills and availability still need explicit owner verification/setup. Parts imports create catalog entries, never stock balances or reservations.

Limits: 5 MiB CSV, 2,000 data records, one dataset per batch. At most 200 row errors are shown with a full count. Rows refer to nonblank logical CSV records, including the header; quoted multiline fields count as one record. Raw files are protected in PostgreSQL and cleared after expiry by the running API's 15-minute retention sweep. Backups and production operations remain Phase 8 work.

## Export company records

Open **CSV exports**, choose a dataset/page and download. The UI uses 1,000 rows per page and reports the total; retrieve further pages as needed during a quiet period. Every request is owner-authorized and audited. No public download link is created. Export fields include internal IDs and external references. Formula-looking values receive a leading apostrophe, including `+` phone numbers. These files are for review; their format differs from import templates.

## Inspect reports and audit

1. Open **Operational reports**. Choose start/end dates in UTC (end exclusive), up to 366 days. These filter planned arrival dates, not creation dates. Click **Calculate report**.
2. Review the mature initial-job denominator, missing outcomes, jobs awaiting 14 days, cancellations and manual exclusions. Empty cohorts show **No mature cohort**. Future demo dates will not produce mature outcomes.
3. First-visit completion/follow-up rate use the same mature initial cohort. The window starts after the later of arrival-window end and recorded closure. Unlinked revisits are not detected automatically.
4. Preparation mean/median measure elapsed time to first approval, not active labor. Current gaps check up to 200 eligible unassigned jobs and disclose any not checked. There are no fabricated historical outcomes or impact estimates.
5. For agreed planned multi-visit work or data-quality issues, open the exclusion control, enter the job ID from job detail and **Load exclusion**. Choose a reason, provide a note and save. Choose **Include in reporting** to restore inclusion. Reload before retrying a stale version; recalculate reports after changes.
6. Open **Audit history**, optionally filter an action such as `IMPORT_COMMITTED`, `CSV_EXPORTED` or `REPORT_EXCLUSION_CHANGED`, then search. Inspect actor, target and details; paginate older events. Dispatcher/technician accounts do not see owner data tools.

## Verify

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
node scripts/generate-phase7-contract.mjs
pnpm check:docs
pnpm smoke
pnpm test:browser
```

On Windows, set `PLAYWRIGHT_CHANNEL=msedge` for installed Edge. The scheduling browser group intentionally waits one rate-limit window; application limits remain enabled. New browser tests cover invalid review, committed-response loss/retry, CSV safety, mobile reporting/exclusions and protected audit. See [design and definitions](../architecture/0007-onboarding-and-reporting.md), [API contract](../api/phase-7-openapi.json) and [completion evidence](../plans/phase-7-checklist.md).
