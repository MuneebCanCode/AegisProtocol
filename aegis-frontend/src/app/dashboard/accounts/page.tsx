"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Wallet, CheckCircle2 } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccountCard } from "@/components/ui/AccountCard";
import { StepProgress } from "@/components/ui/StepProgress";
import { EmptyState } from "@/components/ui/EmptyState";
import { HashscanLink } from "@/components/ui/HashscanLink";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { apiClient } from "@/lib/api-client";
import toast from "react-hot-toast";

// --- Types ---

interface Account {
  id: string;
  accountId: string;
  balance: string;
  status: string;
  hashscanUrl: string;
}

interface ManagedKeyOption {
  id: string;
  alias: string;
  hasAccount: boolean;
}

interface CreationResult {
  accountId: string;
  transactionId: string;
  hashscanUrl: string;
}

// --- Hooks ---

function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<any[]>("/api/accounts");
      const mapped = (res.data ?? []).map((a: any) => ({
        id: a.id,
        accountId: a.accountId,
        balance: String(a.balance ?? "0"),
        status: a.status,
        hashscanUrl: a.hashscanUrl ?? "",
      }));
      setAccounts(mapped);
    } catch {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return { accounts, loading, setAccounts, refetch: fetchAccounts };
}

function useAvailableKeys() {
  const [keys, setKeys] = useState<ManagedKeyOption[]>([]);

  const fetchKeys = useCallback(async () => {
    try {
      const [keysRes, accountsRes] = await Promise.all([
        apiClient.get<any[]>("/api/keys"),
        apiClient.get<any[]>("/api/accounts"),
      ]);
      const usedKeyIds = new Set((accountsRes.data ?? []).map((a: any) => a.managedKeyId));
      const available = (keysRes.data ?? [])
        .filter((k: any) => k.status === "ACTIVE")
        .map((k: any) => ({
          id: k.id,
          alias: k.kmsKeyAlias ?? k.id.slice(0, 8),
          hasAccount: usedKeyIds.has(k.id),
        }));
      setKeys(available);
    } catch {
      setKeys([]);
    }
  }, []);

  return { keys, fetchKeys };
}

const CREATE_STEPS = ["Select Key", "Create Account", "Complete"];

// --- Skeletons ---

function AccountCardSkeleton() {
  return <div className="skeleton-shimmer h-40 w-full rounded-xl" />;
}

// --- Page ---

export default function AccountsPage() {
  const { accounts, loading, setAccounts, refetch } = useAccounts();
  const { keys: availableKeys, fetchKeys } = useAvailableKeys();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [creationDone, setCreationDone] = useState(false);
  const [creationResult, setCreationResult] = useState<CreationResult | null>(null);
  const [selectedKeyId, setSelectedKeyId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const resetModal = useCallback(() => {
    setCurrentStep(0);
    setCompletedSteps([]);
    setCreationDone(false);
    setCreationResult(null);
    setSelectedKeyId("");
    setCreating(false);
  }, []);

  const openCreateModal = useCallback(() => {
    resetModal();
    fetchKeys();
    setDialogOpen(true);
  }, [resetModal, fetchKeys]);

  const handleCreate = useCallback(async () => {
    if (!selectedKeyId) {
      toast.error("Please select a key first");
      return;
    }
    setCreating(true);
    setCompletedSteps([0]);
    setCurrentStep(1);

    try {
      const res = await apiClient.post<any>("/api/accounts", { keyId: selectedKeyId });
      setCompletedSteps([0, 1]);
      setCurrentStep(2);

      setCreationResult({
        accountId: res.data.accountId,
        transactionId: res.transactionId ?? "",
        hashscanUrl: res.hashscanUrl ?? "",
      });

      setTimeout(() => {
        setCompletedSteps([0, 1, 2]);
        setCreationDone(true);
        refetch();
      }, 500);
    } catch {
      setCreating(false);
    }
  }, [selectedKeyId, refetch]);

  const handleUpdate = useCallback((id: string) => {
    console.log("Update account", id);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    },
    [setAccounts]
  );

  const hasAccounts = !loading && accounts.length > 0;
  const isEmpty = !loading && accounts.length === 0;
  const unusedKeys = availableKeys.filter((k) => !k.hasAccount);

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Accounts"
          description="Manage your Hedera accounts backed by KMS keys"
          actionLabel="Create New Account"
          onAction={openCreateModal}
        />

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <AccountCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Create your first KMS-backed Hedera account to get started."
            actionLabel="Create Account"
            onAction={openCreateModal}
          />
        )}

        {/* Account cards grid */}
        {hasAccounts && (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {accounts.map((account) => (
              <motion.div key={account.id} variants={staggerItem}>
                <AccountCard
                  accountId={account.accountId}
                  balance={account.balance}
                  status={account.status}
                  hashscanUrl={account.hashscanUrl}
                  onUpdate={() => handleUpdate(account.id)}
                  onDelete={() => handleDelete(account.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Create Account Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {creationDone ? "Account Created" : "Create New Account"}
              </DialogTitle>
            </DialogHeader>

            {!creating && !creationDone ? (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Select a KMS Key</Label>
                  {unusedKeys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No available keys. Generate a key first on the Keys page.
                    </p>
                  ) : (
                    <Select value={selectedKeyId} onValueChange={setSelectedKeyId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a key..." />
                      </SelectTrigger>
                      <SelectContent>
                        {unusedKeys.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.alias}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={!selectedKeyId || unusedKeys.length === 0}
                  className="w-full"
                >
                  Create Account
                </Button>
              </div>
            ) : !creationDone ? (
              <div className="flex justify-center py-6">
                <StepProgress
                  steps={CREATE_STEPS}
                  currentStep={currentStep}
                  completedSteps={completedSteps}
                />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Success indicator */}
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle2 className="size-5" />
                  <span className="font-medium">
                    Account created successfully
                  </span>
                </div>

                {/* Account details */}
                {creationResult && (
                  <div className="glass-card p-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account ID</span>
                      <HashscanLink
                        entityId={creationResult.accountId}
                        type="account"
                      />
                    </div>
                    {creationResult.transactionId && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Transaction</span>
                        <HashscanLink
                          transactionId={creationResult.transactionId}
                          type="transaction"
                          label="View on Hashscan"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              {creationDone && (
                <Button
                  onClick={() => setDialogOpen(false)}
                  variant="outline"
                >
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
