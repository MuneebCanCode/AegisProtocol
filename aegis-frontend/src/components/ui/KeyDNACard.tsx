"use client";

import { ExternalLink, RotateCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface KeyDNACardProps {
  keyId: string;
  alias: string;
  algorithm: string;
  publicKey: string;
  healthScore: number;
  status: string;
  hashscanUrl?: string;
  onRotate?: () => void;
  onDelete?: () => void;
  className?: string;
}

function getScoreColor(score: number) {
  if (score >= 90) return { stroke: "#10b981", label: "Excellent" };
  if (score >= 70) return { stroke: "#3d5af8", label: "Good" };
  if (score >= 50) return { stroke: "#f59e0b", label: "Fair" };
  return { stroke: "#ef4444", label: "Poor" };
}

function HealthRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const { stroke } = getScoreColor(score);

  return (
    <div className="relative flex size-24 items-center justify-center">
      <svg className="size-24 -rotate-90" viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted-foreground/20"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.5s ease-in-out" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold">{score}</span>
      </div>
    </div>
  );
}

export function KeyDNACard({
  keyId,
  alias,
  algorithm,
  publicKey,
  healthScore,
  status,
  hashscanUrl,
  onRotate,
  onDelete,
  className,
}: KeyDNACardProps) {
  const truncatedKey =
    publicKey.length > 16
      ? `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`
      : publicKey;

  const statusVariant =
    status === "ACTIVE"
      ? "default"
      : status === "PENDING_DELETION"
        ? "destructive"
        : "secondary";

  return (
    <div
      className={cn(
        "gradient-border glass-card overflow-hidden p-4 space-y-4",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold">{alias}</h3>
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
        <HealthRing score={healthScore} />
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="outline">{algorithm}</Badge>
        {hashscanUrl && (
          <a
            href={hashscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Hashscan <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Key ID</p>
          <p className="font-mono text-xs truncate">{keyId}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Public Key</p>
          <p className="font-mono text-xs">{truncatedKey}</p>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-border">
        {onRotate && (
          <Button variant="outline" size="sm" onClick={onRotate}>
            <RotateCw className="size-3" />
            Rotate
          </Button>
        )}
        {onDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="size-3" />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
