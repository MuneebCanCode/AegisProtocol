"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, Plus } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { HashscanLink } from "@/components/ui/HashscanLink";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface Policy {
  id: string;
  name: string;
  maxAmount: number;
  dailyLimit: number;
  whitelist: string[];
  timeRestrictions: string;
  contractId: string;
  status: "ACTIVE" | "DISABLED";
}

// --- Mock data ---

const MOCK_POLICIES: Policy[] = [
  {
    id: "pol-001",
    name: "Treasury Spending Limit",
    maxAmount: 500,
    dailyLimit: 2000,
    whitelist: ["0.0.55001", "0.0.55002", "0.0.55003"],
    timeRestrictions: "09:00-17:00 UTC",
    contractId: "0.0.77001",
    status: "ACTIVE",
  },
  {
    id: "pol-002",
    name: "Dev Fund Policy",
    maxAmount: 100,
    dailyLimit: 500,
    whitelist: ["0.0.55001"],
    timeRestrictions: "None",
    contractId: "0.0.77002",
    status: "ACTIVE",
  },
];

// --- Hooks ---

function usePolicies() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPolicies(MOCK_POLICIES);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { policies, loading };
}

// --- Skeletons ---

function PolicyCardSkeleton() {
  return <div className="skeleton-shimmer h-48 w-full rounded-xl" />;
}

// --- Page ---

export default function PoliciesPage() {
  const { policies, loading } = usePolicies();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [whitelist, setWhitelist] = useState("");
  const [timeRestrictions, setTimeRestrictions] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Create policy", { name, maxAmount, dailyLimit, whitelist, timeRestrictions });
    setDialogOpen(false);
    setName("");
    setMaxAmount("");
    setDailyLimit("");
    setWhitelist("");
    setTimeRestrictions("");
  };

  const hasPolicies = !loading && policies.length > 0;
  const isEmpty = !loading && policies.length === 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Policies"
          description="Smart contract policies governing transaction rules"
          actionLabel="Create Policy"
          onAction={() => setDialogOpen(true)}
        />

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <PolicyCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <EmptyState
            icon={ShieldAlert}
            title="No policies configured"
            description="Create a smart contract policy to enforce transaction rules."
            actionLabel="Create Policy"
            onAction={() => setDialogOpen(true)}
          />
        )}

        {/* Policy cards */}
        {hasPolicies && (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {policies.map((policy) => (
              <motion.div key={policy.id} variants={staggerItem}>
                <div className="glass-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{policy.name}</h3>
                    <Badge variant={policy.status === "ACTIVE" ? "success" : "neutral"}>
                      {policy.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Max Amount</span>
                      <p className="font-medium">{policy.maxAmount} ℏ</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Daily Limit</span>
                      <p className="font-medium">{policy.dailyLimit} ℏ</p>
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Whitelist</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {policy.whitelist.map((addr) => (
                        <Badge key={addr} variant="outline" className="font-mono text-xs">
                          {addr}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Time Restrictions</span>
                    <p className="font-medium">{policy.timeRestrictions}</p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">Contract</span>
                    <HashscanLink entityId={policy.contractId} type="account" label={policy.contractId} />
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Create Policy Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Policy</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="policy-name">Policy Name</Label>
                <Input
                  id="policy-name"
                  placeholder="e.g. Treasury Spending Limit"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="max-amount">Max Amount (ℏ)</Label>
                  <Input
                    id="max-amount"
                    type="number"
                    placeholder="500"
                    min="0"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily-limit">Daily Limit (ℏ)</Label>
                  <Input
                    id="daily-limit"
                    type="number"
                    placeholder="2000"
                    min="0"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="whitelist">Whitelist (comma-separated)</Label>
                <Input
                  id="whitelist"
                  placeholder="0.0.55001, 0.0.55002"
                  value={whitelist}
                  onChange={(e) => setWhitelist(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time-restrictions">Time Restrictions</Label>
                <Input
                  id="time-restrictions"
                  placeholder="09:00-17:00 UTC or None"
                  value={timeRestrictions}
                  onChange={(e) => setTimeRestrictions(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="submit">
                  <Plus className="size-4 mr-1.5" />
                  Create Policy
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
