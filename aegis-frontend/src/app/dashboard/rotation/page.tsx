"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { RotateCw, CheckCircle2, History } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepProgress } from "@/components/ui/StepProgress";
import { HashscanLink } from "@/components/ui/HashscanLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface RotationRecord {
  id: string;
  keyAlias: string;
  oldKeyArn: string;
  newKeyArn: string;
  status: "COMPLETED" | "FAILED" | "IN_PROGRESS";
  transactionId: string;
  auditLogTransactionId: string;
  oldKeyDeletionDate: string;
  timestamp: string;
}

interface RotationResult {
  newKmsKeyArn: string;
  accountUpdateTransactionId: string;
  oldKeyDeletionDate: string;
  auditLogTransactionId: string;
}

// --- Mock data ---

const MOCK_ROTATION_RECORDS: RotationRecord[] = [
  {
    id: "rot-001",
    keyAlias: "Primary Signing Key",
    oldKeyArn: "arn:aws:kms:us-east-1:***:key/old-001",
    newKeyArn: "arn:aws:kms:us-east-1:***:key/new-001",
    status: "COMPLETED",
    transactionId: "0.0.12345@1700000050.000000000",
    auditLogTransactionId: "0.0.12345@1700000051.000000000",
    oldKeyDeletionDate: "2024-02-15",
    timestamp: "2024-01-15T10:30:00Z",
  },
  {
    id: "rot-002",
    keyAlias: "Treasury Key",
    oldKeyArn: "arn:aws:kms:us-east-1:***:key/old-002",
    newKeyArn: "arn:aws:kms:us-east-1:***:key/new-002",
    status: "COMPLETED",
    transactionId: "0.0.12345@1700000060.000000000",
    auditLogTransactionId: "0.0.12345@1700000061.000000000",
    oldKeyDeletionDate: "2024-02-10",
    timestamp: "2024-01-10T14:00:00Z",
  },
  {
    id: "rot-003",
    keyAlias: "Backup Key",
    oldKeyArn: "arn:aws:kms:us-east-1:***:key/old-003",
    newKeyArn: "arn:aws:kms:us-east-1:***:key/new-003",
    status: "FAILED",
    transactionId: "0.0.12345@1700000070.000000000",
    auditLogTransactionId: "0.0.12345@1700000071.000000000",
    oldKeyDeletionDate: "",
    timestamp: "2024-01-08T09:15:00Z",
  },
];

const ROTATION_STEPS = [
  "Generate New KMS Key",
  "Update Hedera Account Key",
  "Schedule Old Key Deletion",
  "Complete",
];

const MOCK_ROTATION_RESULT: RotationResult = {
  newKmsKeyArn: "arn:aws:kms:us-east-1:***:key/abc-***-def",
  accountUpdateTransactionId: "0.0.12345@1700000080.000000000",
  oldKeyDeletionDate: "2024-03-15",
  auditLogTransactionId: "0.0.12345@1700000081.000000000",
};

const STATUS_MAP: Record<RotationRecord["status"], "success" | "error" | "warning"> = {
  COMPLETED: "success",
  FAILED: "error",
  IN_PROGRESS: "warning",
};

// --- Hooks ---

function useRotationHistory() {
  const [records, setRecords] = useState<RotationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRecords(MOCK_ROTATION_RECORDS);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { records, loading };
}

// --- Skeletons ---

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

// --- Page ---

export default function RotationPage() {
  const { records, loading } = useRotationHistory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [rotationDone, setRotationDone] = useState(false);

  const resetModal = useCallback(() => {
    setCurrentStep(0);
    setCompletedSteps([]);
    setRotationDone(false);
  }, []);

  const handleRotateNow = useCallback(() => {
    resetModal();
    setDialogOpen(true);
    let step = 0;
    const advance = () => {
      if (step < ROTATION_STEPS.length - 1) {
        setCompletedSteps((prev) => [...prev, step]);
        step++;
        setCurrentStep(step);
        if (step < ROTATION_STEPS.length - 1) {
          setTimeout(advance, 1200);
        } else {
          setTimeout(() => {
            setCompletedSteps((prev) => [...prev, step]);
            setRotationDone(true);
          }, 800);
        }
      }
    };
    setTimeout(advance, 1200);
  }, [resetModal]);

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Key Rotation"
          description="Rotate KMS keys and view rotation history"
          actionLabel="Rotate Now"
          onAction={handleRotateNow}
        />

        {/* Rotation History */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <History className="size-4" />
            Rotation History
          </h2>

          {loading && <TableSkeleton />}

          {!loading && records.length === 0 && (
            <div className="glass-card p-8 text-center text-sm text-muted-foreground">
              No rotation history yet. Rotate a key to get started.
            </div>
          )}

          {!loading && records.length > 0 && (
            <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              <motion.div variants={staggerItem}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Audit Log</TableHead>
                      <TableHead>Old Key Deletion</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((rec) => (
                      <TableRow key={rec.id}>
                        <TableCell data-label="Key">{rec.keyAlias}</TableCell>
                        <TableCell data-label="Status">
                          <StatusBadge status={STATUS_MAP[rec.status]}>
                            {rec.status}
                          </StatusBadge>
                        </TableCell>
                        <TableCell data-label="Transaction">
                          <HashscanLink transactionId={rec.transactionId} type="transaction" label="View" />
                        </TableCell>
                        <TableCell data-label="Audit Log">
                          <HashscanLink transactionId={rec.auditLogTransactionId} type="transaction" label="View" />
                        </TableCell>
                        <TableCell data-label="Old Key Deletion">
                          {rec.oldKeyDeletionDate || "—"}
                        </TableCell>
                        <TableCell data-label="Date">
                          {new Date(rec.timestamp).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </motion.div>
            </motion.div>
          )}
        </div>

        {/* Rotate Key Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {rotationDone ? "Key Rotated" : "Rotating Key"}
              </DialogTitle>
            </DialogHeader>

            {!rotationDone ? (
              <div className="flex justify-center py-6">
                <StepProgress
                  steps={ROTATION_STEPS}
                  currentStep={currentStep}
                  completedSteps={completedSteps}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle2 className="size-5" />
                  <span className="font-medium">Key rotated successfully</span>
                </div>

                <div className="glass-card p-4 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New KMS Key ARN</span>
                    <span className="font-mono text-xs">{MOCK_ROTATION_RESULT.newKmsKeyArn}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Update</span>
                    <HashscanLink
                      transactionId={MOCK_ROTATION_RESULT.accountUpdateTransactionId}
                      type="transaction"
                      label="View"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Old Key Deletion</span>
                    <span>{MOCK_ROTATION_RESULT.oldKeyDeletionDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">HCS Audit Log</span>
                    <HashscanLink
                      transactionId={MOCK_ROTATION_RESULT.auditLogTransactionId}
                      type="transaction"
                      label="View"
                    />
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              {rotationDone && (
                <Button onClick={() => setDialogOpen(false)} variant="outline">
                  Close
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
