"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield, Coins, TrendingUp, Users } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface InsuranceData {
  currentCoverage: number;
  coverageLevel: "BASIC" | "STANDARD" | "PREMIUM";
  userStake: number;
  poolBalance: number;
  totalStakers: number;
  tokenBalance: number;
  apr: number;
}

// --- Mock data ---

const MOCK_INSURANCE: InsuranceData = {
  currentCoverage: 5000,
  coverageLevel: "STANDARD",
  userStake: 1200,
  poolBalance: 85000,
  totalStakers: 47,
  tokenBalance: 3500,
  apr: 8.5,
};

// --- Hooks ---

function useInsurance() {
  const [data, setData] = useState<InsuranceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(MOCK_INSURANCE);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading, setData };
}

// --- Helpers ---

function getCoverageColor(level: string) {
  if (level === "PREMIUM") return "success";
  if (level === "STANDARD") return "info";
  return "warning";
}

// --- Skeletons ---

function InsuranceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="skeleton-shimmer h-64 rounded-xl" />
        <div className="skeleton-shimmer h-64 rounded-xl" />
      </div>
    </div>
  );
}

// --- Page ---

export default function InsurancePage() {
  const { data, loading } = useInsurance();
  const [stakeAmount, setStakeAmount] = useState("");

  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stakeAmount.trim()) return;
    console.log("Deposit stake", stakeAmount);
    setStakeAmount("");
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Insurance Pool"
          description="Stake tokens to the insurance pool for key compromise coverage"
        />

        {loading && <InsuranceSkeleton />}

        {!loading && data && (
          <motion.div
            className="space-y-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* Stat cards */}
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              variants={staggerItem}
            >
              <StatCard title="Your Stake" value={data.userStake} icon={Coins} suffix=" ℏ" />
              <StatCard title="Pool Balance" value={data.poolBalance} icon={TrendingUp} suffix=" ℏ" />
              <StatCard title="Total Stakers" value={data.totalStakers} icon={Users} />
              <StatCard title="Token Balance" value={data.tokenBalance} icon={Shield} suffix=" ℏ" />
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Stake form */}
              <motion.div variants={staggerItem}>
                <div className="glass-card p-5 space-y-4">
                  <h2 className="text-lg font-semibold">Deposit to Pool</h2>
                  <form onSubmit={handleDeposit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="stake-amount">Stake Amount (ℏ)</Label>
                      <Input
                        id="stake-amount"
                        type="number"
                        placeholder="Enter amount to stake"
                        min="0"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" variant="gradient">
                      <Coins className="size-4 mr-1.5" />
                      Deposit
                    </Button>
                  </form>
                  <div className="pt-3 border-t border-border/50 text-sm text-muted-foreground">
                    Current APR: <span className="font-medium text-foreground">{data.apr}%</span>
                  </div>
                </div>
              </motion.div>

              {/* Coverage info */}
              <motion.div variants={staggerItem}>
                <div className="glass-card p-5 space-y-4">
                  <h2 className="text-lg font-semibold">Coverage Details</h2>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Coverage Level</span>
                      <Badge variant={getCoverageColor(data.coverageLevel) as "success" | "info" | "warning"}>
                        {data.coverageLevel}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Current Coverage</span>
                      <span className="font-medium">{data.currentCoverage.toLocaleString()} ℏ</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Your Stake</span>
                      <span className="font-medium">{data.userStake.toLocaleString()} ℏ</span>
                    </div>
                  </div>

                  {/* Coverage level indicator */}
                  <div className="space-y-2 pt-3 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">Coverage Progress</p>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-aegis-500 to-aegis-400 transition-all duration-700"
                        style={{ width: `${Math.min((data.userStake / 5000) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Basic (500 ℏ)</span>
                      <span>Standard (1,000 ℏ)</span>
                      <span>Premium (5,000 ℏ)</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
