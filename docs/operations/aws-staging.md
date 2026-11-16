# AWS staging setup for a first time AWS user

## Current boundary

The repository includes a CloudFormation template and a manual GitHub Actions release workflow. No AWS resources have been provisioned, no cost estimate has been approved, and no cloud deployment has been verified. Local implementation can proceed independently. Staging remains an open Phase 1 completion item until it is actually deployed and checked.

## What we will deploy

- One Amazon Linux EC2 instance, initially t3.small, with encrypted 30 GB gp3 storage.
- PostgreSQL and the application in containers on that instance, using fictional data only.
- Two private ECR repositories for immutable application images.
- A generated PostgreSQL password in Secrets Manager.
- Systems Manager access with no inbound SSH, HTTP, or database ports.
- A GitHub deployment role using short-lived OIDC credentials restricted to this repository's `staging` environment.

There is no load balancer, NAT gateway, Kubernetes cluster, RDS instance, or public domain in this learning deployment. The instance has a public IPv4 address for outbound connections; the security group accepts no inbound connections. Access uses an encrypted Systems Manager tunnel. This is single-instance staging, not highly available production. Losing or deleting the instance deletes its local database disk; no real customer data is allowed.

## Step 1 Create and protect your account

1. Open the [AWS account creation guide](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct_creating-an-aws-account.html) and complete account, payment, phone, and identity verification. Choose the support/account options appropriate for learning and review the displayed charges and credit terms.
2. Enable MFA for the root user. Keep root credentials private and do not create root access keys.
3. Follow the [Identity Center getting-started guide](https://docs.aws.amazon.com/singlesignon/latest/userguide/getting-started.html) and [default directory setup](https://docs.aws.amazon.com/singlesignon/latest/userguide/quick-start-default-idc.html) to create your daily administrative identity. Account access needs an organization instance with multi-account permissions, not an application-only account instance. AWS may require creating an organization or enabling the relevant account capabilities; review those console choices rather than enabling unrelated services.
4. Sign in through the AWS access portal using that identity. Use temporary sessions for daily work. Do not send passwords, MFA codes, or access keys in chat.

## Step 2 Agree a region and budget before provisioning

Mumbai (`ap-south-1`) is a candidate for an India-based learning environment. It is not selected until you confirm. Choose a maximum monthly amount you are comfortable spending, then review an estimate for that exact region in the [AWS Pricing Calculator](https://calculator.aws/).

Include EC2 runtime, EBS storage, public IPv4, Secrets Manager, ECR storage/scanning where charged, data transfer and applicable tax. Do not assume this configuration is free or fully covered by account credits. The template sets standard T3 CPU credits to avoid unlimited-mode surplus-credit charges; CPU can throttle under sustained load.

Create a [monthly cost budget](https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html) with email alerts at 50, 80 and 100 percent of your chosen amount. A budget alert is not a hard spending cap. Stopping EC2 reduces compute charges but storage, retained secrets/images and other resources may still cost money. We will review the concrete estimate before running create-stack or deploy commands.

## Step 3 Install local AWS access tools

Install the official [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) on Windows. Restart your terminal, then:

```sh
aws --version
aws configure sso --profile servicegrid-dev
aws sso login --profile servicegrid-dev
aws sts get-caller-identity --profile servicegrid-dev
```

The wizard asks for the access-portal start URL, Identity Center region, account and permission set. These come from your own account. No permanent access key is needed. You only need to confirm that sign-in succeeds; do not paste session credentials.

## Step 4 Review and provision the prepared infrastructure

After budget approval, validate `infrastructure/aws/staging.yaml` with CloudFormation. Review IAM policies and the change set before execution. The initial caller needs permission to create the listed VPC, EC2, ECR, Secrets Manager, and IAM resources; the GitHub release role cannot provision them.

Check whether the account already has a GitHub OIDC provider. If it does, supply its ARN as `ExistingOidcProviderArn`; otherwise leave the parameter blank to create one. Use stack name `servicegrid-staging`. Provisioning commands will be run only after confirming account, region and cost.

Record these stack outputs: InstanceId, DeployRoleArn, ApiRepositoryUri, WebRepositoryUri and DatabaseSecretArn. They are identifiers, not the database password. Confirm the EC2 instance appears as an online Systems Manager managed node and that cloud-init completed successfully before releasing.

## Step 5 Configure GitHub

Create an environment named `staging` in repository Settings > Environments. Restrict deployment branches to `main` and configure a required reviewer if available for the repository/account plan. The workflow is manual only and also checks the branch.

Add environment variables, not long-lived AWS keys:

| Variable | Value |
| --- | --- |
| AWS_REGION | Confirmed region |
| AWS_DEPLOY_ROLE_ARN | DeployRoleArn output |
| STAGING_INSTANCE_ID | InstanceId output |
| API_REPOSITORY_URI | ApiRepositoryUri output |
| WEB_REPOSITORY_URI | WebRepositoryUri output |
| DATABASE_SECRET_ARN | DatabaseSecretArn output |

The deployment script currently clones this public repository on the instance. Private-repository support would need a separately authorized source-access mechanism; never embed a personal token in userdata or scripts.

Run Application CI successfully for the intended commit. Then select Actions > AWS staging release > Run workflow on `main`. It builds/tests, publishes commit-tagged images, invokes deployment through SSM, applies additive migrations, and checks readiness. Existing immutable image tags cannot be overwritten; a repeated release of the same SHA reuses already-published images. Database schema rollback is separate from image rollback.

## Step 6 Open staging privately

Create a local file `tmp/ssm-port-forward.json` containing:

```json
{"portNumber":["8080"],"localPortNumber":["8081"]}
```

Keep this command open, replacing the instance ID:

```sh
aws ssm start-session --profile servicegrid-dev --region ap-south-1 --target i-REPLACE_ME --document-name AWS-StartPortForwardingSession --parameters file://tmp/ssm-port-forward.json
```

Use your confirmed region in place of `ap-south-1` if different. Open [http://localhost:8081](http://localhost:8081). The local HTTP connection travels through the encrypted SSM session; this is not a public HTTPS client demo. Verify both API and PostgreSQL on the page. A domain, public TLS entry point and client-access design are separate work before external demonstration.

## Rollback and cleanup

The instance keeps the preceding `.env` as `/opt/servicegrid/.env.previous` with root-only permissions. It contains secrets: never display it in logs. After checking that the previous app supports the current schema, restore it through an SSM shell and run Compose with the previous API/web image tags. Do not attempt to undo a database migration by rolling back the application image. A failed release is reported rather than silently rolling back schema changes.

Deleting the stack terminates the EC2 instance and deletes its local staging database. Back up anything you need first. ECR repositories and the database secret have Retain policies and must be reviewed and removed separately when no longer needed; they can keep accruing charges. Revisit Billing after cleanup. This is a learning environment without verified disaster recovery.

## What to tell me next

Confirm only: account created, MFA enabled, SSO sign-in ready, preferred region and desired maximum monthly budget. We can then calculate and review the exact staging plan before creating anything billable.
