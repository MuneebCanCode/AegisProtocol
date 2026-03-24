"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Server, Coins, TrendingUp, Unplug } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface StakingData {
  stakedNode: string | null;
  stakedAmount: number;
  pendingRewards: number;
  stakingPeriodStart: string | null;
}

// --- Mock data ---

const MOCK_STAKING: StakingData = {
  stakedNode: "node-3",
  stakedAmount: 5000,
  pendingRewards: 125,
  stakingPeriodStart: "2024-01-01T00:00:00Z",
};

// --- Hooks ---

function useStaking() {
  const [data, setData] = useState<StakingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(MOCK_STAKING);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading, setData };
}

// --- Skeletons ---

function StakingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer h-24 rounded-xl" />
        ))}
      </div>
      <div className="skeleton-shimmer h-48 rounded-xl" />
    </div>
  );
}

// --- Page ---

export default function StakingPage() {
  const { data, loading, setData } = useStaking();
  const [nodeId, setNodeId] = useState("");

  const handleStake = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeId.trim()) return;
    console.log("Stake to node", nodeId);
    setNodeId("");
  };

  const handleUnstake = () => {
    if (!data) return;
    setData({
      ...data,
      stakedNode: null,
      stakedAmount: 0,
      pendingRewards: 0,
      stakingPeriodStart: null,
    });
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Staking"
          description="Stake HBAR to Hedera network nodes and earn rewards"
        />

        {loading && <StakingSkeleton />}

        {!loading && data && (
          <motion.div
            className="space-y-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* Stats */}
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
              variants={staggerItem}
            >
              <StatCard title="Staked Amount" value={data.stakedAmount} icon={Coins} suffix=" ℏ" />
              <StatCard title="Pending Rewards" value={data.pendingRewards} icon={TrendingUp} suffix=" ℏ" />
              <StatCard title="Staked Node" value={data.stakedNode ? 1 : 0} icon={Server} />
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Stake form */}
              <motion.div variants={staggerItem}>
                <div className="glass-card p-5 space-y-4">
                  <h2 className="text-lg font-semibold">Stake to Node</h2>
                  <form onSubmit={handleStake} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="node-id">Node ID</Label>
                      <Input
                        id="node-id"
                        placeholder="e.g. node-3"
                        value={nodeId}
                        onChange={(e) => setNodeId(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" variant="gradient">
                      <Server className="size-4 mr-1.5" />
                      Stake
                    </Button>
                  </form>
                </div>
              </motion.div>

              {/* Current staking status */}
              <motion.div variants={staggerItem}>
                <div className="glass-card p-5 space-y-4">
                  <h2 className="text-lg font-semibold">Current Staking Status</h2>
                  {data.stakedNode ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Staked Node</span>
                        <Badge variant="info">{data.stakedNode}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Amount</span>
                        <span className="font-medium">{data.stakedAmount.toLocaleString()} ℏ</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Rewards</span>
                        <span className="font-medium text-green-600 dark:text-green-400">
                          +{data.pendingRewards.toLocaleString()} ℏ
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Since</span>
                        <span className="text-sm">
                          {data.stakingPeriodStart
                            ? new Date(data.stakingPeriodStart).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      <div className="pt-3 border-t border-border/50">
                        <Button variant="destructive" size="sm" onClick={handleUnstake}>
                          <Unplug className="size-3.5 mr-1.5" />
                          Unstake
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <Server className="size-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Not currently staking to any node</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
