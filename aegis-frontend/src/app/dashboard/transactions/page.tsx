"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Send } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { HashscanLink } from "@/components/ui/HashscanLink";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
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

interface Transaction {
  id: string;
  type: string;
  from: string;
  to: string;
  amount: string;
  status: "SUCCESS" | "PENDING" | "FAILED";
  transactionId: string;
  hashscanUrl: string;
  timestamp: string;
}

// --- Mock data ---

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-001",
    type: "HBAR Transfer",
    from: "0.0.12345",
    to: "0.0.67890",
    amount: "25.00",
    status: "SUCCESS",
    transactionId: "0.0.12345@1700000010.000000000",
    hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.12345@1700000010.000000000",
    timestamp: "2024-01-15T10:30:00Z",
  },
  {
    id: "tx-002",
    type: "HBAR Transfer",
    from: "0.0.12345",
    to: "0.0.11111",
    amount: "100.00",
    status: "SUCCESS",
    transactionId: "0.0.12345@1700000020.000000000",
    hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.12345@1700000020.000000000",
    timestamp: "2024-01-14T14:15:00Z",
  },
  {
    id: "tx-003",
    type: "HBAR Transfer",
    from: "0.0.12346",
    to: "0.0.99999",
    amount: "50.00",
    status: "PENDING",
    transactionId: "0.0.12346@1700000030.000000000",
    hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.12346@1700000030.000000000",
    timestamp: "2024-01-14T09:00:00Z",
  },
  {
    id: "tx-004",
    type: "HBAR Transfer",
    from: "0.0.12345",
    to: "0.0.55555",
    amount: "10.00",
    status: "FAILED",
    transactionId: "0.0.12345@1700000040.000000000",
    hashscanUrl: "https://hashscan.io/testnet/transaction/0.0.12345@1700000040.000000000",
    timestamp: "2024-01-13T16:45:00Z",
  },
];

const STATUS_MAP: Record<Transaction["status"], "success" | "warning" | "error"> = {
  SUCCESS: "success",
  PENDING: "warning",
  FAILED: "error",
};

// --- Hooks ---

function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTransactions(MOCK_TRANSACTIONS);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { transactions, loading };
}

// --- Skeletons ---

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

// --- SendHbarForm ---

function SendHbarForm() {
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [policyResult, setPolicyResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!fromAccount || !toAccount || !amount) return;

      setSubmitting(true);
      setPolicyResult(null);

      // Mock policy evaluation with 1s delay
      setTimeout(() => {
        const passed = parseFloat(amount) <= 500;
        setPolicyResult(
          passed ? "Policy check passed" : "Blocked by policy: amount exceeds daily limit"
        );
        setSubmitting(false);
      }, 1000);
    },
    [fromAccount, toAccount, amount]
  );

  const handleConfirm = useCallback(() => {
    // Mock final submission
    setPolicyResult(null);
    setFromAccount("");
    setToAccount("");
    setAmount("");
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4" />
          Send HBAR
        </CardTitle>
        <CardDescription>Transfer HBAR between Hedera accounts</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from-account">From Account</Label>
            <Input
              id="from-account"
              placeholder="0.0.12345"
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to-account">To Account</Label>
            <Input
              id="to-account"
              placeholder="0.0.67890"
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (ℏ)</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Policy evaluation preview */}
          {policyResult && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                policyResult.startsWith("Policy check passed")
                  ? "border-success-500/30 bg-success-500/10 text-success-700 dark:text-success-300"
                  : "border-error-500/30 bg-error-500/10 text-error-700 dark:text-error-300"
              }`}
            >
              {policyResult}
            </div>
          )}

          <div className="flex gap-2">
            {!policyResult ? (
              <Button type="submit" disabled={submitting || !fromAccount || !toAccount || !amount}>
                {submitting ? "Evaluating policy…" : "Submit Transfer"}
              </Button>
            ) : policyResult.startsWith("Policy check passed") ? (
              <Button type="button" onClick={handleConfirm}>
                Confirm &amp; Send
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setPolicyResult(null)}
              >
                Modify Transfer
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// --- Page ---

export default function TransactionsPage() {
  const { transactions, loading } = useTransactions();

  const hasTransactions = !loading && transactions.length > 0;
  const isEmpty = !loading && transactions.length === 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Transactions"
          description="Send HBAR and view transaction history"
        />

        {/* Send HBAR Form */}
        <SendHbarForm />

        {/* Transaction History */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ArrowLeftRight className="size-4" />
            Transaction History
          </h2>

          {loading && <TableSkeleton />}

          {isEmpty && (
            <EmptyState
              icon={ArrowLeftRight}
              title="No transactions yet"
              description="Your transaction history will appear here after your first transfer."
            />
          )}

          {hasTransactions && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={staggerItem} className="mobile-cards">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Amount (ℏ)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell data-label="Type">{tx.type}</TableCell>
                        <TableCell data-label="From">
                          <HashscanLink entityId={tx.from} type="account" label={tx.from} />
                        </TableCell>
                        <TableCell data-label="To">
                          <HashscanLink entityId={tx.to} type="account" label={tx.to} />
                        </TableCell>
                        <TableCell data-label="Amount">{tx.amount}</TableCell>
                        <TableCell data-label="Status">
                          <StatusBadge status={STATUS_MAP[tx.status]}>
                            {tx.status}
                          </StatusBadge>
                        </TableCell>
                        <TableCell data-label="Transaction">
                          <HashscanLink
                            transactionId={tx.transactionId}
                            type="transaction"
                            label="View"
                          />
                        </TableCell>
                        <TableCell data-label="Date">
                          {new Date(tx.timestamp).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
