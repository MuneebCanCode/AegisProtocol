"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { HandCoins, Plus, Trash2 } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { HashscanLink } from "@/components/ui/HashscanLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface Allowance {
  id: string;
  spenderAccountId: string;
  type: "HBAR" | "TOKEN";
  tokenId?: string;
  amount: number;
  status: "ACTIVE" | "REVOKED";
  transactionId: string;
}

// --- Mock data ---

const MOCK_ALLOWANCES: Allowance[] = [
  {
    id: "allow-001",
    spenderAccountId: "0.0.55001",
    type: "HBAR",
    amount: 100,
    status: "ACTIVE",
    transactionId: "0.0.12345@1700000120.000000000",
  },
  {
    id: "allow-002",
    spenderAccountId: "0.0.55002",
    type: "TOKEN",
    tokenId: "0.0.66001",
    amount: 500,
    status: "ACTIVE",
    transactionId: "0.0.12345@1700000130.000000000",
  },
  {
    id: "allow-003",
    spenderAccountId: "0.0.55003",
    type: "HBAR",
    amount: 50,
    status: "REVOKED",
    transactionId: "0.0.12345@1700000140.000000000",
  },
];

// --- Hooks ---

function useAllowances() {
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAllowances(MOCK_ALLOWANCES);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { allowances, loading, setAllowances };
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

export default function AllowancesPage() {
  const { allowances, loading, setAllowances } = useAllowances();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [spender, setSpender] = useState("");
  const [amount, setAmount] = useState("");
  const [allowanceType, setAllowanceType] = useState("HBAR");
  const [tokenId, setTokenId] = useState("");

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Grant allowance", { spender, amount, allowanceType, tokenId });
    setDialogOpen(false);
    setSpender("");
    setAmount("");
    setAllowanceType("HBAR");
    setTokenId("");
  };

  const handleRevoke = (id: string) => {
    setAllowances((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: "REVOKED" as const } : a))
    );
  };

  const hasAllowances = !loading && allowances.length > 0;
  const isEmpty = !loading && allowances.length === 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Allowances"
          description="Manage HBAR and token spending allowances"
          actionLabel="Grant Allowance"
          onAction={() => setDialogOpen(true)}
        />

        {loading && <TableSkeleton />}

        {isEmpty && (
          <EmptyState
            icon={HandCoins}
            title="No allowances"
            description="Grant an allowance to let another account spend on your behalf."
            actionLabel="Grant Allowance"
            onAction={() => setDialogOpen(true)}
          />
        )}

        {hasAllowances && (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible">
            <motion.div variants={staggerItem}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Spender</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allowances.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell data-label="Spender">
                        <HashscanLink entityId={a.spenderAccountId} type="account" label={a.spenderAccountId} />
                      </TableCell>
                      <TableCell data-label="Type">{a.type}</TableCell>
                      <TableCell data-label="Token">
                        {a.tokenId ? (
                          <HashscanLink entityId={a.tokenId} type="token" label={a.tokenId} />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell data-label="Amount">
                        {a.amount} {a.type === "HBAR" ? "ℏ" : "tokens"}
                      </TableCell>
                      <TableCell data-label="Status">
                        <StatusBadge status={a.status === "ACTIVE" ? "success" : "neutral"}>
                          {a.status}
                        </StatusBadge>
                      </TableCell>
                      <TableCell data-label="Transaction">
                        <HashscanLink transactionId={a.transactionId} type="transaction" label="View" />
                      </TableCell>
                      <TableCell data-label="Actions">
                        {a.status === "ACTIVE" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRevoke(a.id)}
                          >
                            <Trash2 className="size-3 mr-1" />
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </motion.div>
          </motion.div>
        )}

        {/* Grant Allowance Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Grant Allowance</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleGrant} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spender-account">Spender Account</Label>
                <Input
                  id="spender-account"
                  placeholder="0.0.xxxxx"
                  value={spender}
                  onChange={(e) => setSpender(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Allowance Type</Label>
                <Select value={allowanceType} onValueChange={(v) => v && setAllowanceType(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HBAR">HBAR</SelectItem>
                    <SelectItem value="TOKEN">Token</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {allowanceType === "TOKEN" && (
                <div className="space-y-2">
                  <Label htmlFor="token-id">Token ID</Label>
                  <Input
                    id="token-id"
                    placeholder="0.0.xxxxx"
                    value={tokenId}
                    onChange={(e) => setTokenId(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="allowance-amount">Amount</Label>
                <Input
                  id="allowance-amount"
                  type="number"
                  placeholder="100"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit">
                  <Plus className="size-4 mr-1.5" />
                  Grant Allowance
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
