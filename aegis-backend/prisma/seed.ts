/// <reference types="node" />
import { PrismaClient, AuditCategory, KeyStatus, AccountStatus, GuardianStatus, DmsStatus, InsuranceStatus, TokenType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting AEGIS Protocol seed...');

  // ── Demo User ──────────────────────────────────────────────────────────────
  const existingUser = await prisma.user.findUnique({ where: { email: 'demo@aegis.protocol' } });
  if (existingUser) {
    console.log('✅ Seed data already exists — skipping (idempotent).');
    return;
  }

  const hashedPassword = await bcrypt.hash('demo123456', 10);
  const user = await prisma.user.create({
    data: {
      email: 'demo@aegis.protocol',
      password: hashedPassword,
      name: 'Demo User',
      recoveryThreshold: 2,
    },
  });
  console.log(`  ✓ Created demo user: ${user.email}`);

  // ── Guardian User ──────────────────────────────────────────────────────────
  const guardianUser = await prisma.user.create({
    data: {
      email: 'guardian@aegis.protocol',
      password: await bcrypt.hash('guardian123456', 10),
      name: 'Guardian User',
    },
  });
  console.log(`  ✓ Created guardian user: ${guardianUser.email}`);

  // ── HCS Topic Configs ─────────────────────────────────────────────────────
  const categories: AuditCategory[] = [
    'KEY_LIFECYCLE', 'SIGNING_EVENTS', 'ACCESS_EVENTS',
    'GUARDIAN_EVENTS', 'POLICY_EVENTS', 'COMPLIANCE_EVENTS',
  ];
  for (let i = 0; i < categories.length; i++) {
    await prisma.hcsTopicConfig.create({
      data: {
        category: categories[i],
        topicId: `0.0.${5000 + i}`,
        memo: `AEGIS ${categories[i]} topic`,
        hashscanUrl: `https://hashscan.io/testnet/topic/0.0.${5000 + i}`,
      },
    });
  }
  console.log('  ✓ Created 6 HCS topic configs');

  // ── Token Configs ──────────────────────────────────────────────────────────
  await prisma.tokenConfig.createMany({
    data: [
      { name: 'AEGIS Governance Token', tokenId: '0.0.6000', type: TokenType.FUNGIBLE, hashscanUrl: 'https://hashscan.io/testnet/token/0.0.6000' },
      { name: 'Key DNA NFT', tokenId: '0.0.6001', type: TokenType.NFT, hashscanUrl: 'https://hashscan.io/testnet/token/0.0.6001' },
      { name: 'Guardian Badge NFT', tokenId: '0.0.6002', type: TokenType.NFT, hashscanUrl: 'https://hashscan.io/testnet/token/0.0.6002' },
    ],
  });
  console.log('  ✓ Created 3 token configs');

  // ── Managed Keys ───────────────────────────────────────────────────────────
  const keys = await Promise.all(
    [
      { alias: 'primary-signing-key', healthScore: 95 },
      { alias: 'backup-key', healthScore: 72 },
      { alias: 'governance-key', healthScore: 58 },
    ].map((k, i) =>
      prisma.managedKey.create({
        data: {
          userId: user.id,
          kmsKeyArn: `arn:aws:kms:us-east-1:123456789012:key/demo-key-${i + 1}`,
          kmsKeyAlias: k.alias,
          publicKey: `302d300706052b8104000a032200${Buffer.from(`demo-pub-${i}`).toString('hex')}`,
          status: KeyStatus.ACTIVE,
          healthScore: k.healthScore,
        },
      })
    )
  );
  console.log(`  ✓ Created ${keys.length} managed keys`);

  // ── Hedera Accounts ────────────────────────────────────────────────────────
  const accounts = await Promise.all(
    keys.slice(0, 2).map((key, i) =>
      prisma.hederaAccount.create({
        data: {
          userId: user.id,
          accountId: `0.0.${7000 + i}`,
          alias: i === 0 ? 'Main Account' : 'Savings',
          managedKeyId: key.id,
          balance: i === 0 ? 1250.5 : 500.0,
          status: AccountStatus.ACTIVE,
          hashscanUrl: `https://hashscan.io/testnet/account/0.0.${7000 + i}`,
        },
      })
    )
  );
  console.log(`  ✓ Created ${accounts.length} Hedera accounts`);

  // ── Guardian Assignment ────────────────────────────────────────────────────
  await prisma.guardianAssignment.create({
    data: {
      userId: user.id,
      guardianUserId: guardianUser.id,
      role: 'Primary Guardian',
      weight: 1,
      status: GuardianStatus.ACTIVE,
      nftSerial: 1,
      hashscanUrl: 'https://hashscan.io/testnet/token/0.0.6002/1',
    },
  });
  console.log('  ✓ Created guardian assignment');

  // ── Transactions ───────────────────────────────────────────────────────────
  const txTypes = ['HBAR_TRANSFER', 'TOKEN_TRANSFER', 'ACCOUNT_CREATE', 'KEY_ROTATION', 'POLICY_DEPLOY'];
  const txData = txTypes.map((type, i) => ({
    userId: user.id,
    type,
    amount: type.includes('TRANSFER') ? 10 + i * 5 : undefined,
    fromAccountId: accounts[0]?.accountId,
    toAccountId: i % 2 === 0 ? '0.0.8000' : accounts[1]?.accountId,
    transactionId: `0.0.7000@${Date.now() / 1000 - i * 3600}.${i * 111111111}`,
    hashscanUrl: `https://hashscan.io/testnet/transaction/0.0.7000-${Date.now() / 1000 - i * 3600}-${i * 111111111}`,
    status: 'SUCCESS',
    details: { memo: `Demo ${type.toLowerCase().replace('_', ' ')}` },
  }));
  await prisma.transaction.createMany({ data: txData });
  console.log(`  ✓ Created ${txData.length} transactions`);

  // ── Policies ───────────────────────────────────────────────────────────────
  await prisma.policy.create({
    data: {
      userId: user.id,
      maxTransactionAmount: 1000,
      dailyLimit: 5000,
      whitelistedAccounts: ['0.0.8000', '0.0.8001'],
      businessHoursOnly: true,
      startHour: 9,
      endHour: 17,
      contractId: '0.0.9000',
      hashscanUrl: 'https://hashscan.io/testnet/contract/0.0.9000',
      isActive: true,
    },
  });
  console.log('  ✓ Created policy');

  // ── Audit Logs (all 6 categories) ─────────────────────────────────────────
  const auditEntries = categories.map((category, i) => ({
    eventType: `DEMO_${category}`,
    category,
    actor: user.id,
    target: keys[0].id,
    details: { action: `Sample ${category.toLowerCase().replace('_', ' ')} event`, index: i },
    kmsKeyId: 'arn:aws:kms:***:demo-key-1',
    signature: 'abcdef1234567890'.repeat(4),
    topicId: `0.0.${5000 + i}`,
    transactionId: `0.0.5000@${Date.now() / 1000 - i * 7200}.${i * 222222222}`,
    hashscanUrl: `https://hashscan.io/testnet/transaction/0.0.5000-${Date.now() / 1000 - i * 7200}-${i * 222222222}`,
    sequenceNumber: i + 1,
  }));
  await prisma.auditLog.createMany({ data: auditEntries });
  console.log(`  ✓ Created ${auditEntries.length} audit log entries`);

  // ── Dead Man Switch ────────────────────────────────────────────────────────
  await prisma.deadmanSwitch.create({
    data: {
      userId: user.id,
      inactivityTimeoutDays: 30,
      recoveryAccountId: '0.0.8000',
      transferAmount: 100,
      sourceAccountId: accounts[0].accountId,
      scheduleId: '0.0.9500',
      status: DmsStatus.ACTIVE,
    },
  });
  console.log('  ✓ Created dead man switch');

  // ── Allowance ──────────────────────────────────────────────────────────────
  await prisma.allowance.create({
    data: {
      userId: user.id,
      ownerAccountId: accounts[0].accountId,
      spenderAccountId: '0.0.8000',
      amount: 50,
      isActive: true,
      transactionId: '0.0.7000@seed.allowance',
      hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.7000-seed-allowance',
    },
  });
  console.log('  ✓ Created allowance');

  // ── Insurance Policy ───────────────────────────────────────────────────────
  await prisma.insurancePolicy.create({
    data: {
      userId: user.id,
      premiumAmount: 10,
      coverageAmount: 1000,
      coverageLevel: 'Standard',
      status: InsuranceStatus.ACTIVE,
      transactionId: '0.0.7000@seed.insurance',
      hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.7000-seed-insurance',
    },
  });
  console.log('  ✓ Created insurance policy');

  // ── Staking Info ───────────────────────────────────────────────────────────
  await prisma.stakingInfo.create({
    data: {
      userId: user.id,
      accountId: accounts[0].accountId,
      stakedNodeId: 3,
      stakeAmount: 200,
      isActive: true,
      transactionId: '0.0.7000@seed.staking',
      hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.7000-seed-staking',
    },
  });
  console.log('  ✓ Created staking info');

  // ── Governance Proposal + Vote ─────────────────────────────────────────────
  const proposal = await prisma.proposal.create({
    data: {
      creatorId: user.id,
      title: 'Increase max transaction limit',
      description: 'Proposal to raise the default max transaction amount from 1000 to 5000 HBAR.',
      options: ['Approve', 'Reject', 'Abstain'],
      votingEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'ACTIVE',
    },
  });
  await prisma.vote.create({
    data: {
      proposalId: proposal.id,
      userId: guardianUser.id,
      option: 'Approve',
      weight: 100,
    },
  });
  console.log('  ✓ Created governance proposal with vote');

  // ── Rotation Record ────────────────────────────────────────────────────────
  await prisma.rotationRecord.create({
    data: {
      managedKeyId: keys[0].id,
      oldKmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/old-demo-key',
      newKmsKeyArn: keys[0].kmsKeyArn,
      transactionId: '0.0.7000@seed.rotation',
      hashscanUrl: 'https://hashscan.io/testnet/transaction/0.0.7000-seed-rotation',
    },
  });
  console.log('  ✓ Created rotation record');

  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
