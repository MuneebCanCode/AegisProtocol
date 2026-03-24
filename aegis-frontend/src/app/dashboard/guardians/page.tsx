"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, UserPlus } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { HashscanLink } from "@/components/ui/HashscanLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface Guardian {
  id: string;
  accountId: string;
  status: "ACTIVE" | "REVOKED";
  nftSerial: number;
  nftHashscanUrl: string;
}

interface ApprovedGuardian {
  accountId: string;
  hashscanUrl: string;
}

interface RecoveryStatus {
  threshold: number;
  approvedCount: number;
  approvedGuardians: ApprovedGuardian[];
}

// --- Mock data ---

const MOCK_GUARDIANS: Guardian[] = [
  {
    id: "g-001",
    accountId: "0.0.55001",
    status: "ACTIVE",
    nftSerial: 1,
    nftHashscanUrl: "https://hashscan.io/testnet/token/0.0.66001/1",
  },
  {
    id: "g-002",
    accountId: "0.0.55002",
    status: "ACTIVE",
    nftSerial: 2,
    nftHashscanUrl: "https://hashscan.io/testnet/token/0.0.66001/2",
  },
  {
    id: "g-003",
    accountId: "0.0.55003",
    status: "REVOKED",
    nftSerial: 3,
    nftHashscanUrl: "https://hashscan.io/testnet/token/0.0.66001/3",
  },
];

const MOCK_RECOVERY: RecoveryStatus = {
  threshold: 3,
  approvedCount: 2,
  approvedGuardians: [
    {
      accountId: "0.0.55001",
      hashscanUrl:
        "https://hashscan.io/testnet/transaction/0.0.55001@1700000010.000000000",
    },
    {
      accountId: "0.0.55002",
      hashscanUrl:
        "https://hashscan.io/testnet/transaction/0.0.55002@1700000011.000000000",
    },
  ],
};

// --- Hooks ---

function useGuardians() {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [recovery, setRecovery] = useState<RecoveryStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGuardians(MOCK_GUARDIANS);
      setRecovery(MOCK_RECOVERY);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { guardians, recovery, loading, setGuardians, setRecovery };
}

// --- Skeletons ---

function GuardianCardSkeleton() {
  return <div className="skeleton-shimmer h-36 w-full rounded-xl" />;
}

function RecoverySkeleton() {
  return <div className="skeleton-shimmer h-48 w-full rounded-xl" />;
}

// --- Page ---

export default function GuardiansPage() {
  const { guardians, recovery, loading } = useGuardians();
  const [newAccountId, setNewAccountId] = useState("");

  const handleAddGuardian = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountId.trim()) return;
    console.log("Add guardian", newAccountId);
    setNewAccountId("");
  };

  const hasGuardians = !loading && guardians.length > 0;
  const isEmpty = !loading && guardians.length === 0;
  const progressPercent = recovery
    ? (recovery.approvedCount / recovery.threshold) * 100
    : 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Guardians"
          description="Manage your guardian network and social recovery"
        />

        {/* Add Guardian Form */}
        <div className="glass-card p-4">
          <form onSubmit={handleAddGuardian} className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="guardian-account">Guardian Account ID</Label>
              <Input
                id="guardian-account"
                placeholder="0.0.xxxxx"
                value={newAccountId}
                onChange={(e) => setNewAccountId(e.target.value)}
              />
            </div>
            <Button type="submit">
              <UserPlus className="size-4 mr-1.5" />
              Add Guardian
            </Button>
          </form>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <GuardianCardSkeleton key={i} />
              ))}
            </div>
            <RecoverySkeleton />
          </>
        )}

        {/* Empty state */}
        {isEmpty && (
          <EmptyState
            icon={ShieldCheck}
            title="No guardians assigned"
            description="Add trusted guardians to enable social recovery for your account."
          />
        )}

        {/* Guardian cards grid */}
        {hasGuardians && (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {guardians.map((guardian) => (
              <motion.div key={guardian.id} variants={staggerItem}>
                <div className="glass-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-5 text-aegis-400" />
                      <span className="font-medium text-sm">
                        {guardian.accountId}
                      </span>
                    </div>
                    <Badge
                      variant={
                        guardian.status === "ACTIVE" ? "success" : "error"
                      }
                    >
                      {guardian.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      NFT Serial #{guardian.nftSerial}
                    </span>
                    <HashscanLink
                      entityId={`0.0.66001/${guardian.nftSerial}`}
                      type="token"
                      label="View NFT"
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Recovery section */}
        {!loading && recovery && (
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-lg font-semibold">Social Recovery</h2>

            {/* Threshold progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Guardian Approvals
                </span>
                <span className="font-medium">
                  {recovery.approvedCount} of {recovery.threshold} guardians
                  approved
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-linear-to-r from-aegis-500 to-aegis-400 transition-all duration-700"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Approved guardians */}
            {recovery.approvedGuardians.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Approved Guardians
                </p>
                {recovery.approvedGuardians.map((ag) => (
                  <div
                    key={ag.accountId}
                    className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm"
                  >
                    <span className="font-mono">{ag.accountId}</span>
                    <HashscanLink
                      transactionId={ag.hashscanUrl.split("/transaction/")[1]}
                      type="transaction"
                      label="View Signature"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}