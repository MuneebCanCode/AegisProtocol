"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Timer, HeartPulse, Settings } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GlowCard } from "@/components/ui/GlowCard";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface DeadManSwitchStatus {
  configured: boolean;
  inactivityTimeoutDays: number;
  beneficiaryAccountId: string;
  lastHeartbeat: string;
  nextDeadline: string;
  status: "ACTIVE" | "WARNING" | "EXPIRED";
}

// --- Mock data ---

const MOCK_DMS_STATUS: DeadManSwitchStatus = {
  configured: true,
  inactivityTimeoutDays: 30,
  beneficiaryAccountId: "0.0.88001",
  lastHeartbeat: "2024-01-14T10:00:00Z",
  nextDeadline: "2024-02-13T10:00:00Z",
  status: "ACTIVE",
};

const DMS_STATUS_MAP: Record<DeadManSwitchStatus["status"], "success" | "warning" | "error"> = {
  ACTIVE: "success",
  WARNING: "warning",
  EXPIRED: "error",
};

// --- Hooks ---

function useDeadManSwitch() {
  const [dmsStatus, setDmsStatus] = useState<DeadManSwitchStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDmsStatus(MOCK_DMS_STATUS);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { dmsStatus, loading };
}

// --- Skeletons ---

function SectionSkeleton() {
  return <div className="skeleton-shimmer h-48 w-full rounded-xl" />;
}

// --- Page ---

export default function DeadManSwitchPage() {
  const { dmsStatus, loading } = useDeadManSwitch();
  const [timeoutDays, setTimeoutDays] = useState("30");
  const [beneficiary, setBeneficiary] = useState("");
  const [pulsing, setPulsing] = useState(false);

  const handleConfigure = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Configure DMS", { timeoutDays, beneficiary });
  };

  const handleHeartbeat = () => {
    setPulsing(true);
    setTimeout(() => setPulsing(false), 2000);
    console.log("Heartbeat sent");
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Dead Man's Switch"
          description="Configure inactivity-based asset transfer"
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
            {/* Heartbeat Section */}
            {dmsStatus?.configured && (
              <motion.div variants={staggerItem}>
                <GlowCard className="flex flex-col items-center gap-6 py-8">
                  <div className="relative">
                    <button
                      onClick={handleHeartbeat}
                      className={`flex size-24 items-center justify-center rounded-full bg-linear-to-br from-aegis-500 to-aegis-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${
                        pulsing ? "animate-pulse shadow-aegis-500/50 shadow-xl" : ""
                      }`}
                      aria-label="Send heartbeat"
                    >
                      <HeartPulse className="size-10" />
                    </button>
                    {pulsing && (
                      <span className="absolute inset-0 rounded-full animate-ping bg-aegis-500/30" />
                    )}
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-lg font-semibold">Send Heartbeat</p>
                    <p className="text-sm text-muted-foreground">
                      Tap to confirm you&apos;re still active
                    </p>
                  </div>

                  {/* Status display */}
                  <div className="grid grid-cols-2 gap-4 w-full max-w-sm text-sm">
                    <div className="text-center">
                      <p className="text-muted-foreground">Last Heartbeat</p>
                      <p className="font-medium">
                        {new Date(dmsStatus.lastHeartbeat).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Next Deadline</p>
                      <p className="font-medium">
                        {new Date(dmsStatus.nextDeadline).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <StatusBadge status={DMS_STATUS_MAP[dmsStatus.status]}>
                    {dmsStatus.status}
                  </StatusBadge>
                </GlowCard>
              </motion.div>
            )}

            {/* Configuration Section */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-5 space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Settings className="size-5 text-aegis-400" />
                  Configuration
                </h2>

                {dmsStatus?.configured && (
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4 rounded-lg border border-border/50 p-3">
                    <div>
                      <span className="text-muted-foreground">Inactivity Timeout</span>
                      <p className="font-medium">{dmsStatus.inactivityTimeoutDays} days</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Beneficiary</span>
                      <p className="font-mono font-medium">{dmsStatus.beneficiaryAccountId}</p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleConfigure} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="timeout-days">Inactivity Timeout (days)</Label>
                      <Input
                        id="timeout-days"
                        type="number"
                        placeholder="30"
                        min="1"
                        value={timeoutDays}
                        onChange={(e) => setTimeoutDays(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="beneficiary">Beneficiary Account</Label>
                      <Input
                        id="beneficiary"
                        placeholder="0.0.xxxxx"
                        value={beneficiary}
                        onChange={(e) => setBeneficiary(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" variant="gradient">
                    <Timer className="size-4 mr-1.5" />
                    {dmsStatus?.configured ? "Update Configuration" : "Configure Switch"}
                  </Button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
