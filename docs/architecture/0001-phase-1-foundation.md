# Phase 1 foundation decisions

Date: 16 November 2026. Status: accepted for local implementation; AWS provisioning pending account and budget review.

- Node.js 24.19.0 and pnpm 11.25.0 are pinned in repository metadata and images. Use one committed pnpm lockfile and frozen installation in CI.
- React 19, Vite 8, Express 5, Zod 4, Prisma 7.10.1 and PostgreSQL 17 form the initial stack. Exact transitive versions are in the lockfile. Prisma 8 is a release candidate at setup time and is intentionally excluded.
- TypeScript 5.9.3 is selected within the lint tooling's supported range. Dependency upgrades require a fresh build, type check and test run.
- Prisma 7 uses prisma.config.ts and the PostgreSQL driver adapter. Reviewed SQL owns the initial migration. Only an Organization table and two fictional seed records are introduced; there are no public data APIs before authentication and tenant isolation.
- API liveness is independent of PostgreSQL. Readiness performs a bounded database query and returns 503 when it fails. Error responses and logs avoid raw dependency messages and secrets.
- Full Docker uses Nginx serving the built frontend and proxying the API on the same origin. Backend and frontend containers run without root privileges. The migration image retains development tooling for the Prisma CLI; slimming that image is a later optimization.
- AWS learning staging uses a single EC2 instance with containers, ECR, Secrets Manager and SSM. There are no inbound security-group rules. This replaces an implicit expectation of a managed database for the first staging exercise, not the later operational-pilot recovery requirements.
- GitHub deployment uses manual workflow dispatch and an environment-scoped OIDC trust relationship. Provisioning is not automatic.
- MIT licensing was explicitly selected by the project owner. This supersedes the pending-license wording in the original planning baseline. Third-party customer documents are not covered by the project's license.
- Authentication implementation remains Phase 2. Provider choice is deferred until then and does not block Phase 1 local foundation.

Remaining gate: review AWS account access, region and cost; deploy and verify staging; record the actual URL/tunnel and commit. Do not mark full Phase 1 complete until that evidence exists.
