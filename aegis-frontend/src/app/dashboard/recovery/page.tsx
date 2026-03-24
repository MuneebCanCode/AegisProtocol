"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, UserCheck, Clock } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { HashscanLink } from "@/components/ui/HashscanLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface MyRecoveryStatus {
  threshold: number;
  approvedCount: number;
  status: "PENDING" | "READY" | "NONE";
  guardians: {
    accountId: string;
    approved: boolean;
    hashscanUrl: string;
  }[];
}

interface GuardianDuty {
  id: string;
  requesterAccountId: string;
  requesterEmail: string;
  threshold: number;
  approvedCount: number;
  status: "PENDING" | "EXECUTED";
  myApproval: boolean;
  scheduleTransactionId: string;
  timestamp: string;
}

// --- Mock data ---

const MOCK_MY_RECOVERY: MyRecoveryStatus = {
  threshold: 3,
  approvedCount: 2,
  status: "PENDING",
  guardians: [
    { accountId: "0.0.55001", approved: true, hashscanUrl: "0.0.55001@1700000090.000000000" },
    { accountId: "0.0.55002", approved: true, hashscanUrl: "0.0.55002@1700000091.000000000" },
    { accountId: "0.0.55003", approved: false, hashscanUrl: "" },
  ],
};

const MOCK_GUARDIAN_DUTIES: GuardianDuty[] = [
  {
    id: "duty-001",
    requesterAccountId: "0.0.44001",
    requesterEmail: "alice@example.com",
    threshold: 2,
    approvedCount: 1,
    status: "PENDING",
    myApproval: false,
    scheduleTransactionId: "0.0.44001@1700000100.000000000",
    timestamp: "2024-01-15T08:00:00Z",
  },
  {
    id: "duty-002",
    requesterAccountId: "0.0.44002",
    requesterEmail: "bob@example.com",
    threshold: 3,
    approvedCount: 3,
    status: "EXECUTED",
    myApproval: true,
    scheduleTransactionId: "0.0.44002@1700000110.000000000",
    timestamp: "2024-01-12T15:30:00Z",
  },
];

// --- Hooks ---

function useRecovery() {
  const [myRecovery, setMyRecovery] = useState<MyRecoveryStatus | null>(null);
  const [duties, setDuties] = useState<GuardianDuty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMyRecovery(MOCK_MY_RECOVERY);
      setDuties(MOCK_GUARDIAN_DUTIES);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { myRecovery, duties, loading };
}

// --- Skeletons ---

function SectionSkeleton() {
  return <div className="skeleton-shimmer h-48 w-full rounded-xl" />;
}

// --- Page ---

export default function RecoveryPage() {
  const { myRecovery, duties, loading } = useRecovery();

  const progressPercent = myRecovery
    ? (myRecovery.approvedCount / myRecovery.threshold) * 100
    : 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Recovery"
          description="Social recovery status and guardian duties"
        />

        {loading && (
          <div className="space-y-4">
            <SectionSkeleton />
            <SectionSkeleton />
          </div>
        )}

        {!loading && (
          <motion.div
            className="space-y-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* My Recovery Section */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-5 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <ShieldCheck className="size-5 text-aegis-400" />
                  My Recovery
                </h2>

                {myRecovery && myRecovery.status !== "NONE" ? (
                  <>
                    {/* Threshold progress */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Guardian Approvals</span>
                        <span className="font-medium">
                          {myRecovery.approvedCount} of {myRecovery.threshold} required
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-linear-to-r from-aegis-500 to-aegis-400 transition-all duration-700"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Guardian list */}
                    <div className="space-y-2">
                      {myRecovery.guardians.map((g) => (
                        <div
                          key={g.accountId}
                          className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-mono">{g.accountId}</span>
                            {g.approved ? (
                              <Badge variant="success">Approved</Badge>
                            ) : (
                              <Badge variant="neutral">Pending</Badge>
                            )}
                          </div>
                          {g.approved && g.hashscanUrl && (
                            <HashscanLink
                              transactionId={g.hashscanUrl}
                              type="transaction"
                              label="View Signature"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No active recovery request. Initiate recovery from the Guardians page.
                  </p>
                )}
              </div>
            </motion.div>

            {/* Guardian Duties Section */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-5 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <UserCheck className="size-5 text-aegis-400" />
                  Guardian Duties
                </h2>

                {duties.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No recovery requests require your approval.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {duties.map((duty) => {
                      const dutyProgress = (duty.approvedCount / duty.threshold) * 100;
                      return (
                        <div key={duty.id} className="rounded-lg border border-border/50 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{duty.requesterEmail}</p>
                              <p className="text-xs text-muted-foreground font-mono">{duty.requesterAccountId}</p>
                            </div>
                            <StatusBadge status={duty.status === "EXECUTED" ? "success" : "warning"}>
                              {duty.status}
                            </StatusBadge>
                          </div>

                          {/* Threshold progress for this duty */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Approvals</span>
                              <span>{duty.approvedCount} / {duty.threshold}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-linear-to-r from-aegis-500 to-aegis-400 transition-all duration-700"
                                style={{ width: `${dutyProgress}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Clock className="size-3" />
                              {new Date(duty.timestamp).toLocaleDateString()}
                            </div>
                            <div className="flex items-center gap-2">
                              <HashscanLink
                                transactionId={duty.scheduleTransactionId}
                                type="transaction"
                                label="View Schedule"
                              />
                              {duty.status === "PENDING" && !duty.myApproval && (
                                <Button
                                  size="sm"
                                  variant="gradient"
                                  onClick={() => console.log("Approve", duty.id)}
                                >
                                  Approve
                                </Button>
                              )}
                              {duty.myApproval && (
                                <Badge variant="success">You approved</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
