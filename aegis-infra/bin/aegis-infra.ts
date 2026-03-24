#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AegisProtocolStack } from '../lib/aegis-protocol-stack';

const app = new cdk.App();

new AegisProtocolStack(app, 'AegisProtocolStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'AEGIS Protocol — IAM user, KMS key policy, and RDS PostgreSQL for key management backend',
});
