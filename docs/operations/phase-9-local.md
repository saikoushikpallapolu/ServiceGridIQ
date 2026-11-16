# Phase 9: private manuals and cited preparation

Phase 9 implements an advisory knowledge layer alongside the core workflow. AWS remains deferred. The technician experience is a responsive mobile web app, not a native or offline app. Uploaded manuals never change readiness, safety evidence, assignments or stock automatically.

## Local setup

Run `pnpm install --frozen-lockfile`, `pnpm setup:env`, `pnpm db:generate`, then:

```sh
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 240
```

The additive knowledge migration requires pgvector. Local PostgreSQL is now the pinned pgvector-enabled PostgreSQL 17 image, retaining the existing volume; an encrypted backup/restore rehearsal was completed before the change. Redis uses authentication and persisted AOF. SeaweedFS supplies private S3-compatible storage with generated local credentials. Port 9000 is loopback-only; bucket requests require credentials. The API proxies authorized downloads rather than exposing object keys/public URLs. The worker reuses the API image and has bounded CPU/memory. Existing company credentials are unchanged. Never print `.env`, storage configuration or keys into shared logs.

## Owner library and review

1. Open **Equipment manual library** as owner. Upload a PDF or UTF-8 text file, title, version and exact equipment manufacturer/model. Use documents you have permission to process; fictional text is suitable for rehearsal.
2. Uploads start QUARANTINED. Type/signature/encoding, size and hash checks are technical validation, not antivirus certification. Review the file in a suitable isolated viewer, model applicability and permitted use before approval.
3. Select a source, enter an owner review note, attest review and choose **Approve and index**. External-AI consent is separate and off by default.
4. Refresh status: QUEUED → PROCESSING → READY, or FAILED with a safe code. Redis jobs retry three times with backoff. A persisted QUEUED row and worker sweep recover a failed enqueue; **Retry / reindex** creates a new revision/job ID after a terminal failure. Source/queue outages do not block ordinary dispatch.
5. **Revoke source** withdraws it from new searches and citation reads immediately. Reindexing also invalidates old chunk IDs. Text already delivered to an authorized client cannot be recalled; users should refresh evidence before relying on it.

PDF extraction runs in a separate Node subprocess with a 20-second timeout, 256 MiB JS heap limit, maximum 100 pages / 1,000,000 extracted characters and at most 500 overlapping chunks. No PDF rendering, document JavaScript, remote links, OCR or embedded-file extraction is invoked. Image-only/encrypted/unsupported PDFs fail rather than producing invented text. Chunks preserve page, source version, revision and company. Original objects are hashed and rechecked before indexing. Private orphan objects can remain if storage succeeds and the database commit subsequently fails; operational object retention/reconciliation is still a hosting gate.

## Dispatcher and technician evidence

Open a job and **Cited manual evidence**, enter a question and retrieve sources. Technicians can do this only for an active authorized assignment. Search filters by exact normalized manufacturer and model, current READY document revision and tenant; no fuzzy model substitution. **Verify current source** rechecks access/approval and displays the underlying chunk. Source excerpts are rendered as text, never HTML.

Without a provider key, full-text retrieval works locally. With explicit AI consent/request, pgvector cosine similarity and PostgreSQL full-text ranking form hybrid retrieval. The 0.65 similarity filter is a heuristic, not calibrated confidence. The release provides AI-selected verbatim excerpts, uncertainty and evidence gaps, rather than generated repair instructions. Each returned AI quote must be an exact substring of the cited retrieved chunk. This protects quote provenance but does not prove completeness, source correctness, applicability beyond the selected model or safe repair outcomes. Qualified human review is required.

## Configure OpenAI later

No key was supplied and no paid provider request was made during the build. Configure your own `OPENAI_API_KEY` and a supported structured-output `OPENAI_SUMMARY_MODEL` in the ignored root `.env` for Compose; use the ignored API `.env` for native development. Restart API/worker. Do not paste credentials in chat, commit them or expose them in the frontend. Manage project billing and permissions in your own OpenAI account. Approve only permitted documents for external processing; reindex them to create embeddings. The UI separately asks to use OpenAI for a job question. Questions and consented excerpts are sent, without customer contact details being added by the application.

The integration uses the [Responses API structured-output format](https://developers.openai.com/api/docs/guides/structured-outputs) with `store:false`, and [text-embedding-3-small](https://developers.openai.com/api/docs/guides/embeddings) with 1,536 dimensions. It uses fixed OpenAI HTTPS endpoints, bounded responses/timeouts and no tools. A company is capped at 100 reserved provider calls and 200,000 reserved tokens per UTC day; failures retain their reservation. Actual token usage is recorded, while prices/currency are left to real project billing rather than fabricated estimates. These application limits do not replace a provider-side spend cap. **View AI usage** exposes status/model/token totals to owners.

Provider outages, refusal/incomplete output, invalid citation quotes or budget exhaustion fall back to labelled local source evidence. No source/answer is fabricated. Live provider quality, real API access and customer-manual evaluation remain unverified until configuration and a reviewed evaluation set are available. Automated tests use provider stubs to exercise real pgvector queries, quote validation and usage accounting without charges.

## Verification and operating boundaries

Run the standard build/type/lint/unit/database/browser commands. The new browser journey covers real private storage → Redis worker → approved indexing → mobile source viewing → revocation. Integration cases cover wrong model, unassigned/cross-company access, quarantine, corrupt objects, stale review and unsupported AI citations. A generated fixture tests actual PDF subprocess extraction.

The earlier encrypted backup drill covers PostgreSQL, not full object/Redis recovery. Before hosting, add private object backup/version retention and restore verification, production secret custody, antivirus policy, queue monitoring and alert delivery. Staging templates remain a foundation, not a deployed full production stack. See the [Phase 8 runbook](phase-8-runbook.md) and [knowledge API](../api/phase-9-openapi.json).
