# Authentication and company isolation

Status: local implementation. AWS staging is explicitly deferred by the project owner. Date: 16 November 2026.

## Identity and sessions

Use OpenID Connect authorization code flow with S256 PKCE, nonce and state through openid-client 6.9.0. Keycloak 26.8.2 is the local development identity provider. HTTPS OIDC configuration supports a future managed provider such as Cognito; no managed cloud provider is provisioned or verified yet.

The backend exchanges the code and validates ID-token signatures using the provider's JWKS, plus issuer, audience, expiration and nonce. Verified email is required. Browser-supplied names, email addresses and roles cannot create an authenticated identity. User identity is uniquely keyed by issuer and subject; equal email addresses do not automatically merge accounts or create memberships.

OAuth transaction state is stored as a digest in PostgreSQL and bound to a short-lived HttpOnly browser cookie. PKCE material is server-side, expires after ten minutes and is consumed once. Authentication/session secrets and tokens are never placed in URL paths or request logs. Raw provider tokens are discarded after the verified identity is established.

API logs serialize request paths without query strings and response status without headers. Nginx access logs omit query strings, cookies, authorization and redirect headers; Nginx error logging is restricted to critical events. This avoids routine callback-code/state logging. API request IDs and HTTP status remain available for troubleshooting.

Application sessions are opaque random 256-bit values stored only as SHA-256 digests in PostgreSQL. Cookies are HttpOnly, SameSite=Lax, path=/, without a Domain attribute. HTTPS deployments use the Secure __Host-sg_session cookie. The loopback-only development setup uses sg_session over HTTP. Login and company switching rotate the session token and CSRF token. Sessions expire no later than the ID token, at most eight hours from login, or after thirty minutes of inactivity. There is no refresh-token persistence in this phase; local ID tokens last fifteen minutes, followed by another provider sign-in.

Logout deletes the application session first, then redirects to the provider's end-session endpoint when available. Keycloak asks the user to confirm provider logout because the application does not retain an ID token for a logout hint. If the provider is unavailable, local logout still succeeds but provider SSO may remain active. Provider-side account revocation is not a substitute for application-session/user revocation; an existing app session lasts until its own checks/expiry.

## Authorization and tenancy

Memberships associate users with organizations and OWNER, DISPATCHER or TECHNICIAN roles. The active organization is stored server-side. Scoped operations require X-Organization-Id to match that active company and an active membership. Every protected request rereads membership and user status; privileges are not trusted from cookies or provider role claims. Switching company verifies membership before issuing a replacement session.

Organization reads, membership changes, invitation operations and audit queries are scoped by organization. Membership IDs have tenant-qualified unique keys. Invitations and audit actors have composite foreign keys to memberships in the same organization. This proves isolation for the Phase 2 records; future customer/job/document modules need their own scoped repositories and tests. Branch restrictions and PostgreSQL RLS are not implemented in this phase.

Mutations require the exact configured Origin and the session CSRF token in X-CSRF-Token. A matching cookie alone cannot authorize a mutation. Owner changes and invitation creation recheck current owner authority inside a transaction holding the organization row lock. Concurrent owner demotions cannot remove all active owners.

## Invitations and provisioning

Only owners create invitations. The app returns a private link for the owner to share; it sends no email. Tokens are stored hashed, expire after 72 hours, and are accepted once by a signed-in account with the exact verified email. A replacement invitation invalidates pending links for the same company/email. Invitation acceptance also checks that the original inviter is still an active owner. Invitation and membership changes append company audit events.

Public company signup and automatic joining by email domain are excluded. Two companies and four membership-bearing users are seeded only when SEED_LOCAL_IDENTITIES=true. Keycloak imports a fifth account without memberships for invitation testing. Re-running the seed preserves roles, revocations and existing identities; it does not grant back removed access. A privileged operator CLI can provision a new company and its first owner only for an already-signed-in trusted-provider user, atomically with audit. Production operator procedures still need access controls before real onboarding.

## Local and managed configurations

AUTH_MODE=local is permitted only with loopback public/issuer origins. Its Docker-only internal transport override maps the public issuer origin to the identity service while preserving the verified issuer value. This exception is not allowed for AUTH_MODE=oidc. Managed mode requires HTTPS for both application and provider and Secure cookies. AUTH_MODE=disabled fails protected requests closed and exposes no company records.

This cookie-based backend-for-frontend design supersedes the initial pilot contract's bearer-token assumption. The Phase 2 API contract documents the implemented subset. Business endpoints in the original pilot contract remain future scope.

## Limits before operational use

Configure and verify the actual managed provider, HTTPS entry point, MFA/password-reset policies, database least privilege, session cleanup/retention, recovery and support access before operational reliance. Local Keycloak development mode and its generated fictional users are not a production identity deployment. No claim of complete security or production readiness is made.
