# Projex CDK Infra (EC2 + RDS + S3)

This CDK app provisions a staging/prod baseline:

- VPC (public app + isolated DB subnets)
- EC2 app host (public subnet, EIP, SSM enabled)
- RDS Postgres (private isolated subnet)
- S3 bucket for company export workbook objects
- Security groups (DB only accessible from app SG)
- Secrets Manager DB credentials

## Prereqs

- AWS account + IAM permissions for VPC/EC2/RDS/S3/SecretsManager/CloudFormation
- AWS CLI configured (`aws configure`)
- Node.js 20+ on your machine

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
AWS_PROFILE=<profile> AWS_REGION=<region> pnpm run cdk:synth -- \
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
AWS_PROFILE=<profile> AWS_REGION=<region> pnpm run cdk:deploy -- \
  -c envName=staging \
  -c instanceType=t4g.small \
  -c dbInstanceType=t4g.micro \
  -c dbAllocatedStorage=20 \
  -c dbBackupRetentionDays=1 \
  -c dbMultiAz=false \
  -c dbName=projex \
  -c dbUsername=projex_app
```

## Outputs

After deploy, collect:

- `Ec2PublicIp`
- `DbEndpointAddress`
- `DbEndpointPort`
- `DbSecretArn`
- `ExportBucketName`

Use `DbSecretArn` to fetch DB credentials and build `DATABASE_URL` for your app env.
Use `ExportBucketName` with:

- `S3_BUCKET=<ExportBucketName>`
- `S3_REGION=<aws region, for example ap-southeast-2>`

When running on AWS S3 itself, the app normally does not need:

- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

## Notes

- This stack now removes the unused NAT gateway and private app subnet tier to keep recurring baseline cost down.
- Defaults now target Graviton burstable instances (`t4g.small` for EC2 and `t4g.micro` for RDS) because they are the lowest-cost sensible Linux baseline in many regions, including Sydney, assuming your app dependencies are Arm-compatible.
- The EC2 default intentionally stays at `t4g.small` because the current deploy flow runs `pnpm install` and `pnpm run build` on the instance. That is usually the first place a `t4g.micro` becomes uncomfortable. If you move to prebuilt artifact deploys and restart-only runtime updates, `t4g.micro` becomes a more realistic lowest-cost app-host option.
- RDS now defaults to the cheapest predictable posture this repo can reasonably support: `db.t4g.micro`, `20` GiB, `gp3`, `1` day backup retention, no storage autoscaling, and no Multi-AZ.
- If RDS cost is still too high, the next step is architectural rather than just tuning: move Postgres onto the EC2 host for a dev/very-low-budget environment, or choose a non-RDS managed Postgres provider. That is cheaper, but it is a meaningful tradeoff in durability and operations.
- The EC2 host remains public with a stable Elastic IP because the current app shape assumes a single-host nginx/node deployment without a load balancer.
- Non-production export buckets are destroyed with auto-delete enabled. Production export buckets are retained.
- The export bucket includes a lifecycle rule as a safety net for stale objects, but the application still performs primary 24-hour job/object cleanup itself.
- Non-production stack uses destructive defaults on destroy (`RemovalPolicy.DESTROY` for DB).
- Production stack still retains DB (`RemovalPolicy.RETAIN`) and enables deletion protection, but it no longer forces Multi-AZ. If you need higher resilience, opt back into `-c dbMultiAz=true`.
- Instance bootstraps Node + nginx only; app deployment remains your existing SSH/CI flow.
