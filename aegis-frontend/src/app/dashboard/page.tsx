"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Key, Wallet, ArrowLeftRight, FileText, Activity } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { HashscanLink } from "@/components/ui/HashscanLink";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { apiClient } from "@/lib/api-client";

// --- Types ---

interface DashboardData {
  stats: {
    totalKeys: number;
    activeAccounts: number;
    recentTransactions: number;
    activePolicies: number;
    avgHealthScore: number;
  };
  transactionVolume: { date: string; count: number }[];
  rotationHistory: { month: string; rotations: number }[];
  recentAuditLogs: {
    id: string;
    eventType: string;
    category: string;
    timestamp: string;
    transactionId: string;
    hashscanUrl: string;
  }[];
}

// --- Real data hook ---

function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [keysRes, accountsRes, auditRes, policiesRes] = await Promise.all([
          apiClient.get<any[]>("/api/keys"),
          apiClient.get<any[]>("/api/accounts"),
          apiClient.get<any[]>("/api/audit?limit=5"),
          apiClient.get<any[]>("/api/policies"),
        ]);

        const keys = keysRes.data ?? [];
        const accounts = accountsRes.data ?? [];
        const auditLogs = auditRes.data ?? [];
        const policies = policiesRes.data ?? [];

        const activeKeys = keys.filter((k: any) => k.status === "ACTIVE");
        const activeAccounts = accounts.filter((a: any) => a.status === "ACTIVE");
        const activePolicies = policies.filter((p: any) => p.isActive);
        const avgHealth = activeKeys.length > 0
          ? Math.round(activeKeys.reduce((sum: number, k: any) => sum + (k.healthScore ?? 100), 0) / activeKeys.length)
          : 100;

        // Build transaction volume from audit logs (last 7 days)
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const volumeMap: Record<string, number> = {};
        days.forEach((d) => (volumeMap[d] = 0));
        auditLogs.forEach((log: any) => {
          const day = days[new Date(log.createdAt).getDay()];
          volumeMap[day] = (volumeMap[day] || 0) + 1;
        });
        const today = new Date().getDay();
        const transactionVolume = Array.from({ length: 7 }, (_, i) => {
          const dayIdx = (today - 6 + i + 7) % 7;
          return { date: days[dayIdx], count: volumeMap[days[dayIdx]] || 0 };
        });

        // Build rotation history (placeholder — real data would come from rotation records)
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
        const rotationHistory = months.map((m) => ({ month: m, rotations: 0 }));

        const recentAuditLogs = auditLogs.slice(0, 5).map((log: any) => ({
          id: log.id,
          eventType: log.eventType,
          category: log.category,
          timestamp: log.createdAt,
          transactionId: log.transactionId ?? "",
          hashscanUrl: log.hashscanUrl ?? "",
        }));

        setData({
          stats: {
            totalKeys: keys.length,
            activeAccounts: activeAccounts.length,
            recentTransactions: auditLogs.length,
            activePolicies: activePolicies.length,
            avgHealthScore: avgHealth,
          },
          transactionVolume,
          rotationHistory,
          recentAuditLogs,
        });
      } catch {
        // On error, show empty state
        setData({
          stats: { totalKeys: 0, activeAccounts: 0, recentTransactions: 0, activePolicies: 0, avgHealthScore: 0 },
          transactionVolume: [],
          rotationHistory: [],
          recentAuditLogs: [],
        });
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  return { data, loading };
}

// --- Skeleton components ---

function StatCardSkeleton() {
  return <div className="skeleton-shimmer h-24 w-full" />;
}

function ChartSkeleton() {
  return <div className="skeleton-shimmer h-72 w-full" />;
}

function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-10 w-full" />
      ))}
    </div>
  );
}

// --- Helpers ---

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CHART_COLOR = "#3d5af8";

// --- Page ---

export default function DashboardPage() {
  const { data, loading } = useDashboardData();

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Overview of your AEGIS key management system"
        />

        {/* Stat cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={staggerItem}>
              <StatCard
                title="Managed Keys"
                value={data!.stats.totalKeys}
                icon={Key}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard
                title="Active Accounts"
                value={data!.stats.activeAccounts}
                icon={Wallet}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard
                title="Recent Transactions"
                value={data!.stats.recentTransactions}
                icon={ArrowLeftRight}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard
                title="Active Policies"
                value={data!.stats.activePolicies}
                icon={FileText}
              />
            </motion.div>
            <motion.div variants={staggerItem}>
              <StatCard
                title="Avg Health Score"
                value={data!.stats.avgHealthScore}
                icon={Activity}
                suffix="/100"
              />
            </motion.div>
          </motion.div>
        )}

        {/* Charts */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Transaction Volume Area Chart */}
            <div className="glass-card p-4">
              <h3 className="text-base font-semibold mb-4">
                Transaction Volume (Last 7 Days)
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={data!.transactionVolume}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={CHART_COLOR}
                    fill={CHART_COLOR}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Key Rotation History Bar Chart */}
            <div className="glass-card p-4">
              <h3 className="text-base font-semibold mb-4">
                Key Rotation History (Last 6 Months)
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data!.rotationHistory}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar
                    dataKey="rotations"
                    fill={CHART_COLOR}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent Audit Logs */}
        <div className="glass-card p-4">
          <h3 className="text-base font-semibold mb-4">Recent Audit Logs</h3>
          {loading ? (
            <TableSkeleton />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Transaction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data!.recentAuditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      {log.eventType}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {log.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell>
                      <HashscanLink
                        transactionId={log.transactionId}
                        type="transaction"
                        label="View on Hashscan"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
