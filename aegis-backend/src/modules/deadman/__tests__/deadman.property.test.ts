import * as fc from 'fast-check';

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockDeadmanSwitchFindFirst = jest.fn();
const mockDeadmanSwitchUpdate = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    deadmanSwitch: {
      findFirst: (...args: unknown[]) => mockDeadmanSwitchFindFirst(...args),
      update: (...args: unknown[]) => mockDeadmanSwitchUpdate(...args),
    },
  },
}));

// ── Mock Hedera Client ───────────────────────────────────────────────────────

const mockDeleteSchedule = jest.fn();
const mockCreateSchedule = jest.fn();

jest.mock('@/modules/hedera/hedera.client', () => ({
  deleteSchedule: (...args: unknown[]) => mockDeleteSchedule(...args),
  createSchedule: (...args: unknown[]) => mockCreateSchedule(...args),
}));

// ── Mock Audit Service ───────────────────────────────────────────────────────

const mockAuditLog = jest.fn();

jest.mock('@/modules/audit/audit.service', () => ({
  log: (...args: unknown[]) => mockAuditLog(...args),
}));

// ── Mock @hashgraph/sdk ──────────────────────────────────────────────────────

jest.mock('@hashgraph/sdk', () => ({
  TransferTransaction: jest.fn().mockImplementation(() => ({
    addHbarTransfer: jest.fn().mockReturnThis(),
  })),
  Hbar: jest.fn((amount: number) => amount),
  AccountId: { fromString: jest.fn((s: string) => s) },
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { sendHeartbeat } from '../deadman.service';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Dead Man Switch Property Tests', () => {
  // Feature: aegis-protocol, Property 32: Heartbeat Resets Dead Man's Switch
  // **Validates: Requirements 27.3**
  it('Property 32: Heartbeat Resets Dead Man\'s Switch — sendHeartbeat deletes old schedule, creates new one, updates DB', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string({ minLength: 5, maxLength: 20 }).map((s) => `schedule-${s}`),
        async (userId, oldScheduleId) => {
          jest.clearAllMocks();

          const switchId = 'switch-1';
          const newScheduleId = 'schedule-new-123';

          mockDeadmanSwitchFindFirst.mockResolvedValueOnce({
            id: switchId,
            userId,
            scheduleId: oldScheduleId,
            sourceAccountId: '0.0.1111',
            recoveryAccountId: '0.0.2222',
            transferAmount: 100,
            inactivityTimeoutDays: 30,
            status: 'ACTIVE',
          });

          mockDeleteSchedule.mockResolvedValueOnce({
            transactionId: 'tx-delete',
            hashscanUrl: 'url',
            status: 'SUCCESS',
          });

          mockCreateSchedule.mockResolvedValueOnce({
            scheduleId: newScheduleId,
            transactionId: 'tx-create',
            hashscanUrl: 'url',
            status: 'SUCCESS',
          });

          mockDeadmanSwitchUpdate.mockImplementationOnce((args: any) =>
            Promise.resolve({ id: switchId, ...args.data }),
          );

          mockAuditLog.mockResolvedValueOnce({});

          await sendHeartbeat(userId);

          // Verify old schedule was deleted
          expect(mockDeleteSchedule).toHaveBeenCalledWith(oldScheduleId);

          // Verify new schedule was created
          expect(mockCreateSchedule).toHaveBeenCalledTimes(1);

          // Verify DB update with new lastHeartbeat and scheduleId
          expect(mockDeadmanSwitchUpdate).toHaveBeenCalledWith({
            where: { id: switchId },
            data: {
              lastHeartbeat: expect.any(Date),
              scheduleId: newScheduleId,
            },
          });
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
