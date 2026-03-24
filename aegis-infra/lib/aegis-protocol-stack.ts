import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class AegisProtocolStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── IAM User for AEGIS Backend ───────────────────────────────────
    const aegisUser = new iam.User(this, 'AegisBackendUser', {
      userName: 'aegis-backend-kms-user',
    });

    // Access key for the backend .env
    const accessKey = new iam.AccessKey(this, 'AegisBackendAccessKey', {
      user: aegisUser,
    });

    // KMS policy — scoped to secp256k1 signing keys only
    const kmsPolicy = new iam.Policy(this, 'AegisKmsPolicy', {
      policyName: 'aegis-kms-secp256k1-policy',
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowKmsKeyCreation',
          effect: iam.Effect.ALLOW,
          actions: [
            'kms:CreateKey',
            'kms:CreateAlias',
            'kms:ListKeys',
            'kms:ListAliases',
            'kms:DescribeKey',
            'kms:TagResource',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          sid: 'AllowKmsKeyOperations',
          effect: iam.Effect.ALLOW,
          actions: [
            'kms:GetPublicKey',
            'kms:Sign',
            'kms:ScheduleKeyDeletion',
            'kms:DescribeKey',
          ],
          resources: [
            `arn:aws:kms:${this.region}:${this.account}:key/*`,
          ],
          conditions: {
            StringEquals: {
              'kms:KeySpec': 'ECC_SECG_P256K1',
            },
          },
        }),
      ],
    });

    kmsPolicy.attachToUser(aegisUser);

    // ─── VPC for RDS ──────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, 'AegisVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Security group for RDS
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'AegisDbSg', {
      vpc,
      description: 'Allow PostgreSQL access from local dev',
      allowAllOutbound: false,
    });

    // Allow inbound PostgreSQL from anywhere (for dev — tighten for prod)
    dbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from dev machines'
    );

    // ─── RDS PostgreSQL ───────────────────────────────────────────────
    const dbCredentials = new secretsmanager.Secret(this, 'AegisDbCredentials', {
      secretName: 'aegis/db-credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'aegis_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
    });

    const dbInstance = new rds.DatabaseInstance(this, 'AegisPostgres', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(dbCredentials),
      databaseName: 'aegis',
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      publiclyAccessible: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      deletionProtection: false,
      backupRetention: cdk.Duration.days(1),
    });

    // ─── Outputs ──────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AwsAccessKeyId', {
      value: accessKey.accessKeyId,
      description: 'AWS Access Key ID for aegis-backend .env',
    });

    new cdk.CfnOutput(this, 'AwsSecretAccessKey', {
      value: accessKey.secretAccessKey.unsafeUnwrap(),
      description: 'AWS Secret Access Key for aegis-backend .env (rotate after first use)',
    });

    new cdk.CfnOutput(this, 'AwsRegion', {
      value: this.region,
      description: 'AWS Region',
    });

    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
      description: 'RDS PostgreSQL endpoint',
    });

    new cdk.CfnOutput(this, 'DatabasePort', {
      value: dbInstance.dbInstanceEndpointPort,
      description: 'RDS PostgreSQL port',
    });

    new cdk.CfnOutput(this, 'DatabaseSecretArn', {
      value: dbCredentials.secretArn,
      description: 'Secrets Manager ARN for DB credentials (retrieve with: aws secretsmanager get-secret-value)',
    });

    new cdk.CfnOutput(this, 'DatabaseUrl', {
      value: `postgresql://aegis_admin:<PASSWORD_FROM_SECRETS_MANAGER>@${dbInstance.dbInstanceEndpointAddress}:${dbInstance.dbInstanceEndpointPort}/aegis`,
      description: 'DATABASE_URL template — replace <PASSWORD_FROM_SECRETS_MANAGER> with actual password',
    });
  }
}
