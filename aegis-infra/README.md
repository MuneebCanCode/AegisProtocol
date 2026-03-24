# AEGIS Protocol — AWS CDK Infrastructure

Provisions the AWS resources needed by the AEGIS backend:

- **IAM User** with scoped KMS permissions (secp256k1 key creation, signing, deletion)
- **RDS PostgreSQL 16** (t4g.micro, publicly accessible for dev)
- **Secrets Manager** secret for DB credentials

## Prerequisites

- AWS CLI configured (`aws configure`)
- Node.js 18+
- CDK CLI: `npm install -g aws-cdk`

## Deploy

```bash
cd aegis-infra
npm install
npx cdk bootstrap   # first time only
npx cdk deploy
```

## After Deploy

The stack outputs will print:
- `AwsAccessKeyId` / `AwsSecretAccessKey` → paste into `aegis-backend/.env`
- `DatabaseEndpoint` / `DatabasePort` → build your `DATABASE_URL`
- `DatabaseSecretArn` → retrieve the DB password:

```bash
aws secretsmanager get-secret-value --secret-id aegis/db-credentials --query SecretString --output text
```

## Tear Down

```bash
npx cdk destroy
```
