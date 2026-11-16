# Local development

## Prerequisites

- Node.js 24.19.0, matching `.node-version` and the container images.
- pnpm 11.25.0: `npm install --global pnpm@11.25.0`.
- Docker Desktop with the Linux engine running and Docker Compose available.

Run commands from the repository root. On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

## First setup

```sh
pnpm install --frozen-lockfile
pnpm setup:env
pnpm db:generate
docker compose --env-file .env -f infrastructure/compose.yaml up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite development proxy sends health requests to the API at port 3001. Keep the terminal open; Ctrl+C stops both development servers. The first contracts build is automatic; restart `pnpm dev` after changing shared contracts.

`setup:env` generates random development credentials in ignored `.env` and `apps/api/.env` files without printing them. Existing files are preserved. Examples contain placeholders, not usable credentials. If you change the database port or password manually, update both files. An existing PostgreSQL volume keeps its original password; changing environment variables does not change database credentials.

## Entire application in Docker

```sh
pnpm setup:env
docker compose --env-file .env -f infrastructure/compose.yaml up -d --build --wait --wait-timeout 180
pnpm smoke
```

Open [http://localhost:8080](http://localhost:8080). PostgreSQL is available only on host loopback; the API is private to the Compose network. The web container proxies health requests. A one-shot migration container must finish before the API starts. Database data persists in a Docker volume.

To add the two fictional organizations inside the full stack:

```sh
docker compose --env-file .env -f infrastructure/compose.yaml run --rm migrate pnpm --filter @servicegrid/api db:seed
```

The seed is idempotent. No organization records are exposed through a public API in Phase 1.

## Verification

```sh
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm db:migrate
pnpm db:seed
pnpm test:integration
pnpm check:docs
pnpm smoke
```

Integration tests require PostgreSQL plus migration and seed. Smoke checks require the complete stack at port 8080. Set `SMOKE_BASE_URL` to test another origin. No business or authentication endpoints exist yet.

## Logs and dependency failure

```sh
docker compose --env-file .env -f infrastructure/compose.yaml ps
docker compose --env-file .env -f infrastructure/compose.yaml logs --tail 50 api
docker compose --env-file .env -f infrastructure/compose.yaml stop db
```

After stopping the database, `/health/live` should stay HTTP 200 while `/health/ready` becomes HTTP 503. Restore it with `docker compose --env-file .env -f infrastructure/compose.yaml start db`, then check readiness again. Logs use generated request IDs and do not intentionally expose database URLs, authorization headers, cookies, or request bodies.

## Stop and restart

```sh
docker compose --env-file .env -f infrastructure/compose.yaml down
docker compose --env-file .env -f infrastructure/compose.yaml up -d --wait
```

`down` preserves the database volume. Do not add `--volumes` unless you intend to delete the local database. Avoid running native dev servers and full Docker services on conflicting ports. Full operational backup and restore procedures remain Phase 8 work.
