# Projex CDK Infra (EC2 + RDS)

This CDK app provisions a staging/prod baseline:

- VPC (public + private app + isolated DB subnets)
- EC2 app host (public subnet, EIP, SSM enabled)
- RDS Postgres (private isolated subnet)
- Security groups (DB only accessible from app SG)
- Secrets Manager DB credentials

## Prereqs

- AWS account + IAM permissions for VPC/EC2/RDS/SecretsManager/CloudFormation
- AWS CLI configured (`aws configure`)
- Node.js 20+ on your machine

## Install

From repo root:

```bash
npm run cdk:install
```

## Bootstrap CDK (once per account/region)

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> npm run cdk:bootstrap
```

## Context values

You can override per run using `-c key=value`:

- `envName` (`staging` or `production`)
- `instanceType` (default `t3.small`)
- `dbName` (default `projex`)
- `dbUsername` (default `projex_app`)
- `sshCidr` (optional; keep empty for SSM-only access)

## Preview

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> npm run cdk:synth -- \
  -c envName=staging \
  -c instanceType=t3.small \
  -c dbName=projex \
  -c dbUsername=projex_app
```

## Deploy Staging

```bash
AWS_PROFILE=<profile> AWS_REGION=<region> npm run cdk:deploy -- \
  -c envName=staging \
  -c instanceType=t3.small \
  -c dbName=projex \
  -c dbUsername=projex_app
```

## Outputs

After deploy, collect:

- `Ec2PublicIp`
- `DbEndpointAddress`
- `DbEndpointPort`
- `DbSecretArn`

Use `DbSecretArn` to fetch DB credentials and build `DATABASE_URL` for your app env.

## Notes

- Non-production stack uses destructive defaults on destroy (`RemovalPolicy.DESTROY` for DB).
- Production stack retains DB (`RemovalPolicy.RETAIN`) and enables deletion protection.
- Instance bootstraps Node + nginx only; app deployment remains your existing SSH/CI flow.
