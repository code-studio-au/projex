# Projex CDK Infra (EC2 + RDS + S3)

This CDK app provisions a staging/prod baseline:

- VPC (public app + isolated DB subnets)
- EC2 app host (public subnet, EIP, SSM enabled)
- RDS Postgres (private isolated subnet)
- S3 bucket for company export workbook objects
- S3 bucket for temporary deploy artifact handoff
- account-wide GitHub Actions OIDC provider
- environment-scoped GitHub deploy role with narrow S3 and SSM access
- Security groups (DB only accessible from app SG)
- Secrets Manager DB credentials

## Prereqs

- AWS account + IAM permissions for VPC/EC2/RDS/S3/SecretsManager/CloudFormation
- AWS CLI v2 using short-lived human authentication. For example:

  ```bash
  aws login --profile <profile> --region <region>
  ```

  IAM Identity Center (`aws sso login`) is the preferred team setup. Do not
  configure a root or IAM-user access key for routine CDK work.

- Node.js 24 on your machine, matching the root repo `.nvmrc`, `.node-version`,
  and CI/deploy workflows

## Install

From repo root:

```bash
pnpm run cdk:install
```

## Bootstrap CDK (once per account/region)

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> pnpm run cdk:bootstrap
```

## Context values

You can override per run using `-c key=value`:

- `envName` (`staging` or `production`)
- `githubRepository` (default `code-studio-au/projex`)
- `deployInstanceId` (optional; provide with `deployArtifactBucketName` to
  synthesize the environment OIDC deploy-role stack)
- `deployArtifactBucketName` (optional; provide with `deployInstanceId`)
- `instanceType` (default `t4g.small`)
- `dbInstanceType` (default `t4g.micro`)
- `dbAllocatedStorage` (default `20`)
- `dbMaxAllocatedStorage` (optional; omitted by default so storage stays fixed and predictable)
- `dbBackupRetentionDays` (default `1`)
- `dbMultiAz` (default `false`)
- `dbName` (default `projex`)
- `dbUsername` (default `projex_app`)
- `exportBucketName` (optional; let CDK name it unless you need a fixed global bucket name)
- `sshCidr` (optional; keep empty for SSM-only access)

Recommended region for this repo:

- `ap-southeast-2` (Sydney)

## Preview

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> pnpm run cdk:synth \
  -c envName=staging \
  -c instanceType=t4g.small \
  -c dbInstanceType=t4g.micro \
  -c dbAllocatedStorage=20 \
  -c dbBackupRetentionDays=1 \
  -c dbMultiAz=false \
  -c dbName=projex \
  -c dbUsername=projex_app
```

`cdk.out/` is a generated synth artifact directory and should stay uncommitted.
This repo ignores `deploy/cdk/cdk.out/`; regenerate it locally when you need to
inspect templates.

## Deploy Staging

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> pnpm run cdk:deploy \
  ProjexInfra-staging \
  -c envName=staging \
  -c instanceType=t4g.small \
  -c dbInstanceType=t4g.micro \
  -c dbAllocatedStorage=20 \
  -c dbBackupRetentionDays=1 \
  -c dbMultiAz=false \
  -c dbName=projex \
  -c dbUsername=projex_app
```

After the infrastructure stack succeeds, deploy the separate OIDC identity and
environment role stacks using its outputs:

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> pnpm run cdk:deploy \
  ProjexGithubIdentity ProjexGithubDeploy-staging \
  -c envName=staging \
  -c deployInstanceId=<Ec2InstanceId> \
  -c deployArtifactBucketName=<DeployArtifactBucketName>
```

Keeping the deploy identity separate is intentional. Adding or updating the
GitHub role does not update the EC2/RDS/VPC stack, so unrelated AMI or bootstrap
drift cannot replace the application host during a credential migration.

## Outputs

After deploy, collect:

- `Ec2PublicIp`
- `Ec2InstanceId`
- `DbEndpointAddress`
- `DbEndpointPort`
- `DbSecretArn`
- `ExportBucketName`
- `DeployArtifactBucketName`
- `GithubDeployRoleArn` from `ProjexGithubDeploy-<environment>`

Use `DbSecretArn` to fetch DB credentials and build `DATABASE_URL` for your app env.
Use `ExportBucketName` with:

- `S3_BUCKET=<ExportBucketName>`
- `S3_REGION=<aws region, for example ap-southeast-2>`

Use `DeployArtifactBucketName` with:

- `EC2_DEPLOY_ARTIFACT_BUCKET=<DeployArtifactBucketName>`

That bucket is for temporary GitHub Actions deploy handoff only. CI uploads the
release tarball there, then the EC2 instance downloads it over SSM-dispatched
deploy commands using the instance IAM role.

When running on AWS S3 itself, the app normally does not need:

- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

## First Boot Result

The EC2 host created by this stack now self-prepares into a deploy-ready baseline on first boot. User data installs:

- Node.js 24
- Corepack with pinned pnpm
- nginx
- `/opt/projex/releases` and `/opt/projex/shared/nginx-maintenance`
- the non-login `projex-deploy` identity with its own pinned pnpm cache
- root-owned application release directories
- `/etc/projex/projex.env.example` and a `root:projex-deploy` mode-`0640`
  placeholder `/etc/projex/projex.env` on first boot only
- the `projex` systemd unit
- a safe HTTP bootstrap nginx config
- `/usr/local/bin/projex-provision-letsencrypt-cert` for the later HTTPS step

That means a fresh CDK-created instance should be ready to receive the GitHub Actions artifact deploy flow without manual package installation or service-file setup.

The instance explicitly requires IMDSv2. The application service runs as
`ec2-user` with a strict systemd sandbox and a read-only release tree; only its
state directory is writable. On-host production dependency installation and
database migrations run as `projex-deploy`, not as the elevated SSM command
identity.

The bootstrap installs the current Node.js 24 LTS binary for the host
architecture directly from the official Node.js release service and verifies
it against the published SHA-256 manifest before installation. It does not
depend on a third-party package-repository setup script.

The `ProjexGithubIdentity` stack owns the account-wide
`token.actions.githubusercontent.com` provider. Each
`ProjexGithubDeploy-<environment>` stack owns a deploy role whose trust policy
accepts only:

```text
repo:<githubRepository>:environment:<envName>
```

The role can upload only under that environment's deploy-artifact prefix, send
`AWS-RunShellScript` only to that stack's EC2 instance, and read command
results. It cannot use general S3 or SSM administration APIs.

For the matching GitHub environment that will run
`.github/workflows/deploy.yml`, set:

- environment variable
  `AWS_DEPLOY_ROLE_ARN=<GithubDeployRoleArn output>`
- `EC2_INSTANCE_ID=<Ec2InstanceId output>`
- `EC2_DEPLOY_ARTIFACT_BUCKET=<DeployArtifactBucketName output>`
- `EC2_PUBLIC_BASE_URL=https://your-public-hostname`
- optional overrides: `EC2_APP_ROOT`, `EC2_ENV_FILE`, `EC2_SERVICE_NAME`,
  `EC2_HEALTH_URL`, `EC2_READY_URL`, `EC2_KEEP_RELEASES`

Do not configure AWS access-key secrets. After an existing environment
successfully deploys through OIDC, delete its GitHub `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` secrets and revoke the
corresponding IAM access key.

Keep `sshCidr` empty unless you have a separate operational need for SSH
outside the repo's supported deployment flow. The supported deployment path is
SSM, not SSH.

## Notes

- This stack now removes the unused NAT gateway and private app subnet tier to keep recurring baseline cost down.
- Defaults now target Graviton burstable instances (`t4g.small` for EC2 and `t4g.micro` for RDS) because they are the lowest-cost sensible Linux baseline in many regions, including Sydney, assuming your app dependencies are Arm-compatible.
- The EC2 default intentionally stays at `t4g.small` as the safest baseline for current runtime shape, package install pressure, nginx, Node SSR, and operational headroom. The default GitHub Actions deploy flow is now artifact-based, so the instance no longer builds the app on-box during normal releases. That makes `t4g.micro` more plausible for very low-traffic environments, but it is still a conscious capacity tradeoff rather than the repo default.
- RDS now defaults to the cheapest predictable posture this repo can reasonably support: `db.t4g.micro`, `20` GiB, `gp3`, `1` day backup retention, no storage autoscaling, and no Multi-AZ.
- If RDS cost is still too high, the next step is architectural rather than just tuning: move Postgres onto the EC2 host for a dev/very-low-budget environment, or choose a non-RDS managed Postgres provider. That is cheaper, but it is a meaningful tradeoff in durability and operations.
- The EC2 host remains public with a stable Elastic IP because the current app shape assumes a single-host nginx/node deployment without a load balancer.
- Non-production export buckets are destroyed with auto-delete enabled. Production export buckets are retained.
- The export bucket includes a lifecycle rule as a safety net for stale objects, but the application still performs primary 24-hour job/object cleanup itself.
- Non-production stack uses destructive defaults on destroy (`RemovalPolicy.DESTROY` for DB).
- Production stack still retains DB (`RemovalPolicy.RETAIN`) and enables deletion protection, but it no longer forces Multi-AZ. If you need higher resilience, opt back into `-c dbMultiAz=true`.
- Instance bootstraps Node 24, pnpm, systemd, bootstrap nginx, and the Let's Encrypt helper; application deploy remains the repo's artifact-based EC2 flow described in `docs/deployment-ec2.md` and `docs/staging-runbook.md`.
