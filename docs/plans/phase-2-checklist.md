# Phase 2 local authentication checklist

AWS staging was explicitly deferred by the owner to proceed locally. This phase covers local authentication and identity/organization records, not the later job/document/stock modules or production identity deployment.

## Implemented

- [x] Standard OIDC authorization-code flow with S256 PKCE, nonce and cookie-bound state.
- [x] ID-token signature, issuer, audience, expiry and verified-email checks.
- [x] PostgreSQL-backed opaque sessions, HttpOnly cookies, rotation, expiration and logout revocation.
- [x] Strict same-origin and CSRF checks for mutations.
- [x] Organization picker with membership verification and session rotation on selection.
- [x] Owner, dispatcher and technician roles enforced on the server.
- [x] Company-scoped membership and audit access with composite database foreign keys.
- [x] Immediate membership rechecks and serialized last-owner protection.
- [x] Owner-generated private invitations with hashed tokens, expiry and verified-email acceptance.
- [x] Controlled operator CLI for provisioning a company and its initial verified owner.
- [x] Local Keycloak provider and randomly generated ignored fictional accounts.
- [x] Migration, idempotent local seed, API contract and operation guides.
- [x] Thirteen unit/protocol tests, including forged-token and expired-token rejection.
- [x] Sixteen PostgreSQL integration tests, including tenant isolation and owner-change concurrency.
- [x] Three native real-provider browser scenarios, including mobile role restrictions and logout.
- [x] Four full-Docker real-provider browser scenarios, including invitation acceptance, and smoke checks.

## Final evidence

- [x] Final containers rebuilt after domain-service changes; four browser tests and smoke checks passed.
- [ ] Record the successful GitHub CI run for Phase 2.

## Explicitly outside this local completion gate

- AWS staging provisioning, region/budget approval and cloud deployment.
- Configuring a real HTTPS managed provider and production MFA/password-reset policies.
- Future customer/job/document/inventory tenant isolation, branch restrictions and RLS.
- Production recovery, retention/cleanup automation, support access and complete security assessment.

See [authentication design](../architecture/0002-authentication-and-tenancy.md), [local guide](../operations/phase-2-local.md), and [implemented API contract](../api/phase-2-openapi.json).
