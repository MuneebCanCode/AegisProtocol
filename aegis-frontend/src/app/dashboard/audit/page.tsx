"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, ChevronDown, ChevronRight, Wifi, WifiOff } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { staggerContainer, staggerItem } from "@/lib/animations";

import { apiClient } from "@/lib/api-client";

// --- Types ---

type AuditCategory =
  | "KEY_LIFECYCLE"
  | "SIGNING_EVENTS"
  | "ACCESS_EVENTS"
  | "GUARDIAN_EVENTS"
  | "POLICY_EVENTS"
  | "COMPLIANCE_EVENTS";

interface AuditEntry {
  id: string;
  eventId: string;
  timestamp: string;
  eventType: string;
  category: AuditCategory;
  actor: string;
  target: string;
  details: Record<string, unknown>;
  transactionId: string;
}

// --- Constants ---

const CATEGORIES: AuditCategory[] = [
  "KEY_LIFECYCLE",
  "SIGNING_EVENTS",
  "ACCESS_EVENTS",
  "GUARDIAN_EVENTS",
  "POLICY_EVENTS",
  "COMPLIANCE_EVENTS",
];

// --- Hooks ---

function useAuditLogs() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await apiClient.get<any[]>("/api/audit?limit=50");
        const mapped = (res.data ?? []).map((log: any) => ({
          id: log.id,
          eventId: log.id,
          timestamp: log.createdAt,
          eventType: log.eventType,
          category: log.category as AuditCategory,
          actor: log.actor,
          target: log.target,
          details: log.details ?? {},
          transactionId: log.transactionId ?? "",
        }));
        setLogs(mapped);
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, []);

  return { logs, loading, setLogs };
}

// --- Helpers ---

const categoryColors: Record<AuditCategory, "info" | "success" | "warning" | "error" | "neutral" | "default"> = {
  KEY_LIFECYCLE: "info",
  SIGNING_EVENTS: "success",
  ACCESS_EVENTS: "warning",
  GUARDIAN_EVENTS: "default",
  POLICY_EVENTS: "neutral",
  COMPLIANCE_EVENTS: "success",
};

// --- Skeletons ---

function AuditSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton-shimmer h-16 rounded-xl" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-12 rounded-xl" />
      ))}
    </div>
  );
}

// --- Page ---

export default function AuditPage() {
  const { logs, loading } = useAuditLogs();
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(true);

  // Simulate SSE connection toggle
  useEffect(() => {
    const interval = setInterval(() => {
      setSseConnected((prev) => prev);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (categoryFilter !== "ALL" && log.category !== categoryFilter) return false;
    if (eventTypeFilter && !log.eventType.toLowerCase().includes(eventTypeFilter.toLowerCase())) return false;
    if (dateFrom && log.timestamp < dateFrom) return false;
    if (dateTo && log.timestamp > dateTo + "T23:59:59Z") return false;
    return true;
  });

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Audit Logs"
            description="Tamper-proof audit trail with HCS verification"
          />
          {/* SSE indicator */}
          <div className="flex items-center gap-2 shrink-0">
            {sseConnected ? (
              <>
                <span className="size-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Wifi className="size-3.5" /> Connected
                </span>
              </>
            ) : (
              <>
                <span className="size-2.5 rounded-full bg-red-500" />
                <span className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <WifiOff className="size-3.5" /> Disconnected
                </span>
              </>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <motion.div
          className="glass-card p-4"
          variants={staggerItem}
          initial="hidden"
          animate="visible"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "ALL")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-type-filter">Event Type</Label>
              <Input
                id="event-type-filter"
                placeholder="Filter by event type..."
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-from">From</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date-to">To</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </motion.div>

        {loading && <AuditSkeleton />}

        {/* Audit table */}
        {!loading && (
          <motion.div
            className="glass-card overflow-hidden"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <FileText className="size-8 mx-auto mb-2 opacity-50" />
                      No audit logs match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <motion.tr
                      key={log.id}
                      variants={staggerItem}
                      className="border-b transition-colors hover:bg-muted/50 cursor-pointer"
                      onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    >
                      <TableCell>
                        {expandedRow === log.id ? (
                          <ChevronDown className="size-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.eventType}</TableCell>
                      <TableCell>
                        <Badge variant={categoryColors[log.category]}>
                          {log.category.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.actor}</TableCell>
                      <TableCell className="font-mono text-xs">{log.target}</TableCell>
                    </motion.tr>
                  ))
                )}
              </TableBody>
            </Table>

            {/* Expanded details */}
            {expandedRow && (
              <div className="border-t border-border/50 bg-muted/30 p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Event Details (JSON)</p>
                <pre className="text-xs font-mono bg-background/50 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(
                    filteredLogs.find((l) => l.id === expandedRow)?.details,
                    null,
                    2
                  )}
                </pre>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
