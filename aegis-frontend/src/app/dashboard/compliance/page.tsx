"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ClipboardCheck,
  Download,
  FileBarChart,
  RotateCw,
  ShieldCheck,
  FileText,
  Shield,
  Coins,
} from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { staggerContainer, staggerItem } from "@/lib/animations";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// --- Types ---

interface ComplianceCategory {
  name: string;
  weight: string;
  score: number;
  status: string;
  description: string;
  icon: React.ElementType;
}

interface ComplianceData {
  overallScore: number;
  categories: ComplianceCategory[];
  healthDistribution: { label: string; count: number; color: string }[];
}

// --- Mock data ---

const MOCK_COMPLIANCE: ComplianceData = {
  overallScore: 82,
  categories: [
    {
      name: "Key Rotation Compliance",
      weight: "25%",
      score: 90,
      status: "Excellent",
      description: "Keys are rotated within recommended intervals",
      icon: RotateCw,
    },
    {
      name: "Guardian Coverage",
      weight: "20%",
      score: 75,
      status: "Good",
      description: "Guardian network provides adequate recovery coverage",
      icon: ShieldCheck,
    },
    {
      name: "Audit Log Completeness",
      weight: "20%",
      score: 85,
      status: "Excellent",
      description: "All critical operations are logged and verified",
      icon: FileText,
    },
    {
      name: "Policy Coverage",
      weight: "20%",
      score: 70,
      status: "Good",
      description: "Transaction policies cover most active accounts",
      icon: Shield,
    },
    {
      name: "Insurance Coverage",
      weight: "15%",
      score: 80,
      status: "Good",
      description: "Insurance pool stake provides standard coverage",
      icon: Coins,
    },
  ],
  healthDistribution: [
    { label: "Excellent", count: 2, color: "#10b981" },
    { label: "Good", count: 1, color: "#3d5af8" },
    { label: "Fair", count: 1, color: "#f59e0b" },
    { label: "Poor", count: 0, color: "#ef4444" },
  ],
};

// --- Hooks ---

function useCompliance() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(MOCK_COMPLIANCE);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading };
}

// --- Helpers ---

function getScoreColor(score: number) {
  if (score > 80) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}

function getScoreVariant(score: number): "success" | "warning" | "error" {
  if (score > 80) return "success";
  if (score >= 50) return "warning";
  return "error";
}

// --- Components ---

function ComplianceRing({ score }: { score: number }) {
  const radius = 70;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="relative flex size-48 items-center justify-center">
      <svg className="size-48 -rotate-90" viewBox="0 0 160 160">
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted-foreground/20"
        />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.5s ease-in-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-bold">{score}</span>
        <span className="text-sm text-muted-foreground">Overall Score</span>
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: ComplianceCategory }) {
  const Icon = category.icon;
  const barColor = getScoreColor(category.score);
  const variant = getScoreVariant(category.score);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-5 text-muted-foreground" />
          <h3 className="font-medium text-sm">{category.name}</h3>
        </div>
        <Badge variant={variant}>{category.status}</Badge>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Weight: {category.weight}</span>
        <span className="font-bold text-lg">{category.score}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${category.score}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{category.description}</p>
    </div>
  );
}

// --- Skeletons ---

function ComplianceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton-shimmer h-56 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// --- Page ---

export default function CompliancePage() {
  const { data, loading } = useCompliance();

  const handleGenerateReport = () => {
    console.log("Generate compliance report");
  };

  const handleExportCsv = () => {
    console.log("Export CSV");
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Compliance Dashboard"
          description="Monitor your compliance posture across all security categories"
        />

        {loading && <ComplianceSkeleton />}

        {!loading && data && (
          <motion.div
            className="space-y-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* Overall score ring + actions */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-6 flex flex-col sm:flex-row items-center gap-6">
                <ComplianceRing score={data.overallScore} />
                <div className="flex-1 space-y-3 text-center sm:text-left">
                  <h2 className="text-xl font-semibold">Compliance Score</h2>
                  <p className="text-sm text-muted-foreground">
                    Your overall compliance score is calculated from 5 weighted categories.
                    Maintain scores above 80% across all categories for optimal security posture.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <Button variant="gradient" onClick={handleGenerateReport}>
                      <FileBarChart className="size-4 mr-1.5" />
                      Generate Report
                    </Button>
                    <Button variant="outline" onClick={handleExportCsv}>
                      <Download className="size-4 mr-1.5" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Category cards */}
            <motion.div variants={staggerItem}>
              <h2 className="text-lg font-semibold mb-3">Compliance Categories</h2>
            </motion.div>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {data.categories.map((cat) => (
                <motion.div key={cat.name} variants={staggerItem}>
                  <CategoryCard category={cat} />
                </motion.div>
              ))}
            </motion.div>

            {/* Health score distribution */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-5 space-y-4">
                <h2 className="text-lg font-semibold">Key Health Score Distribution</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.healthDistribution}>
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {data.healthDistribution.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
