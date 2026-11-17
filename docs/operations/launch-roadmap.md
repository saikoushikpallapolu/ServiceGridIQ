# Hosted release roadmap

Decision recorded on 2026-11-17: no AWS account yet; Mumbai (`ap-south-1`) selected; free-plan/eligible-credit usage only. No out-of-pocket spending or paid-plan upgrade is authorized. Domain ownership is unconfirmed. No cloud resources have been created by this review.

## 1. Account and cost eligibility — current step

1. Start at the [official AWS Free Tier page](https://aws.amazon.com/free/). Select the **Free account plan** if offered and eligible. Review the actual signup terms; credits are temporary, not a permanent hosting allowance.
2. Complete AWS verification privately. Enable root MFA and store recovery details securely. Do not create root access keys or share passwords, MFA codes, billing details or keys in chat.
3. In Billing, verify the account plan, remaining credits and expiry date. Report only the plan name, credit amount and expiry date. If only a Paid plan is offered, stop before proceeding under this budget constraint.
4. Do not create/join AWS Organizations or set up Control Tower for this path. AWS documents that these actions can automatically upgrade a Free plan to Paid. See [plan rules](https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html).
5. Select Mumbai (`ap-south-1`) for project resources. Billing/IAM screens may be global. No domain is assumed purchased or available.
6. Review available free usage/credit notifications and a zero-spend budget alert where supported. Alerts are notifications, not a hard spending cap. Check credit consumption and expiry separately from net billed cost.
7. Establish a separate MFA-protected daily identity without triggering an Organizations upgrade. Review its permissions before provisioning; do not use root for deployments.
8. Install the official [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html). Restart the terminal.
9. For an eligible non-root console identity, use the current [console-login CLI flow](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html):

   ```sh
   aws --version
   aws login --profile servicegrid-dev --region ap-south-1
   aws sts get-caller-identity --profile servicegrid-dev --region ap-south-1
   ```

   If login is unavailable, update CLI v2 and check permissions against the official guide. Do not fall back to creating permanent access keys merely to bypass setup. Identity Center/SSO is an alternative only after its account-plan implications are resolved.

**Gate:** Free plan/credits confirmed, MFA enabled, non-root temporary access ready, services eligible, regional resource estimate reviewed. Check EC2, disk, IPv4, ECR, secrets, logs, backups and data transfer individually. Stop if the full stack cannot fit the authorized allowance. No promise of indefinite zero-cost hosting is made.

## 2. Complete the deployment implementation before provisioning

The existing infrastructure is a foundation, not a full-product release. Audit findings:

| File / area | Present | Required before full hosted validation |
| --- | --- | --- |
| `infrastructure/aws/staging.yaml` | VPC, outbound-capable public subnet, no inbound rules, SSM instance, ECR, database secret, GitHub OIDC role | Recheck instance memory/storage, plan eligibility, complete runtime-secret access, backup/log/alert handling and full-stack capacity |
| `infrastructure/aws/compose.staging.yaml` | PostgreSQL, migrations, API and web | Auth configuration, Redis, private document storage, worker, restart/resource policies and secret wiring |
| `infrastructure/aws/deploy.sh` | Database secret retrieval, image pull, migration/start and readiness | Complete config preservation, all service credentials, meaningful product checks, release evidence and recovery procedure |
| `.github/workflows/staging.yml` | Manual release, tests, immutable commit-tagged ECR images, AWS OIDC, SSM deployment, `staging` environment | Hosted end-to-end gates and accurate environment URL/status reporting |
| `scripts/aws-dispatch.mjs` | Exact commit checkout and SSM status polling | Full release acceptance evidence; SSM success alone does not establish business-workflow success |

The API currently defaults to authentication disabled if its auth settings are omitted. Do not expose the foundation stack publicly. Local Keycloak development settings are not production identity configuration.

Complete and review these implementation changes, validate CloudFormation and Compose, then review a change set and resource costs. Reuse the API image for the worker. Do not add Kubernetes, NAT gateways, managed databases or load balancers merely for portfolio appearance.

## 3. Private staging and authenticated access

1. Provision only the reviewed, credit-eligible resources after the account gate passes.
2. Confirm encrypted storage, SSM connectivity and no inbound SSH/database/Redis/storage-admin ports. A public IPv4 for outbound traffic does not make the app publicly reachable when inbound rules are closed.
3. Configure GitHub's `staging` environment, main-branch restrictions and environment-scoped AWS identifiers. Trust GitHub's OIDC environment subject; do not store permanent AWS keys in GitHub.
4. Deploy the exact verified commit and inspect all container health/status results. Check API/database, Redis connectivity, worker processing and private storage behavior with fictional data.
5. Use SSM for operator access. A loopback HTTP health tunnel is sufficient for foundation smoke checks, **not** proof that managed sign-in or full browser workflows work.
6. Establish the staging hostname, trusted HTTPS and restricted tester access before managed OIDC browser tests. The application explicitly requires HTTPS for `AUTH_MODE=oidc`. Choose the concrete certificate, DNS and access design after confirming domain availability, free-plan support and costs.
7. Configure a suitable managed OIDC provider: issuer, client ID, confidential-client secret if applicable, verified email, exact callback (`https://HOST/api/auth/callback`) and logout URLs. Disable unrestricted signup where appropriate. Use separate fictional test identities and company memberships.

**Gate:** All services work, authenticated staging access works on desktop and mobile, only intended testers can reach it, and internal services remain private. A VPN/SSM-only address must not be advertised as a publicly accessible demo URL.

## 4. Server-side secrets and optional OpenAI

1. Store database, Redis/storage, OIDC and metrics credentials in Secrets Manager or a reviewed server-side equivalent. Scope IAM read permissions to the required secrets. Fetch through a runtime role, keep temporary material private, and exclude values from source, logs and browser bundles.
2. Treat the OpenAI API as a separately billed service. AWS promotional credits do not fund it. Under the current free-only authorization, keep the live provider disabled and demonstrate local cited search.
3. If a provider budget is later authorized, use a dedicated OpenAI project/key, configure the existing model settings server-side, and add provider-side usage controls in addition to application caps. Check the provider's current billing controls rather than assuming alerts are hard limits.
4. Upload a permitted fictional/manual test file, review model applicability and safety, approve indexing, and explicitly consent to external processing.
5. Test explicit AI opt-in, grounded quotations, current-source verification, uncertainty/gaps, revocation, provider outage fallback and company usage limits. Verify outbound processing stays within authorized sources and budget.

**Gate:** Never claim live AI verification from stubbed tests or local search. Rotation and revocation must be rehearsed without leaking keys.

## 5. Hosted acceptance and recovery

Run against the actual staging origin using separately provisioned hosted test identities. Existing browser fixtures are localhost/local-Keycloak oriented; adapt identity setup and origin handling before calling them hosted tests. Do not upload `.data/local-accounts.json` or reuse public demo passwords.

| Check | Acceptance evidence |
| --- | --- |
| Owner / dispatcher / technician | Real sign-in, correct company/role tools and complete request-to-closure workflow |
| Isolation | Cross-company IDs and downloads rejected; withdrawn technician access rejected |
| Stock concurrency | Two approvals competing for the last item yield one protected allocation |
| Retry behavior | Lost assignment/consumption response can be retried without a duplicate operation |
| Mobile | Phone viewport and real-device access through staging HTTPS; no reliance on the phone's localhost |
| Documents | Private upload, approval, worker ingestion, cited retrieval and revocation |
| Internal access | Database, Redis, metrics and admin interfaces unreachable from unauthorized external clients |
| Recovery | Encrypted backup restored into a separate database; counts, stock ledger and operational readiness checked |
| Operations | Logs without secrets, alert delivery, capacity checks and compatible image recovery |

Save commit SHA, image identifiers, configuration references, test results and restore timings. Do not roll back database schemas merely by rolling back images. Budget for off-instance backup/key custody before genuine customer data.

## 6. GitHub deployment history and public demo

GitHub's screenshot-style deployment list comes from real environment deployments, not README badges. The existing release job already declares `environment: staging`. [GitHub documents environment deployment visibility here](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).

1. Use `staging` for restricted evaluation. Mark success only after its declared hosted checks pass.
2. Add `production` only when a real public demo is ready, with separate configuration, credentials/data and a release gate.
3. Add a true `preview` environment later only if temporary previews are actually deployed. Use isolated fictional data, teardown/expiry and no privileged secrets for untrusted pull requests. Preview capacity is not currently budgeted.
4. Set the real public demo URL through the deployment job's environment URL. Do not put a localhost tunnel URL or AWS admin console URL in a public-demo link.
5. Link failures to logs and record failed deployments honestly. The deployment count reflects actual releases; do not create placeholder successes to imitate another repository's count.

Before public access: verify HTTPS, managed identity, application edge rules, private internal services, safe fictional fixtures, restricted invitations and protection against destructive demo actions. Public demo availability does not automatically authorize onboarding real customer data. A short-lived AWS Free plan is not a durable production hosting commitment.

## 7. Walkthrough and company discovery

Record a 3–5 minute video: business problem → overview → request/preparation → approved technician → mobile visit/stock use → follow-up/reporting → cited evidence. Use fictional records; omit secrets, admin consoles and credentials. Add the final video link to the README's Product demo section.

Discovery can begin before public hosting: identify relevant HVAC service businesses, ask how they dispatch today, how parts are confirmed and why revisits occur. Prepare a short message and demonstration agenda, track responses and agree on small pilot measures. No outreach messages are authorized by this roadmap alone; explicit recipient/message authorization is needed before sending. No genuine customer records should be onboarded before security and operating gates pass.

## Immediate handoff

Complete account creation only. Confirm: Free plan available, root MFA enabled, credits/expiry visible, Mumbai selected. Do not send credentials or create a CloudFormation stack yet. The next action is the eligibility/cost review and non-root access setup, followed by the complete staging implementation.
