"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AccountCardProps {
  accountId: string;
  balance: string;
  status: string;
  hashscanUrl?: string;
  onUpdate?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function AccountCard({
  accountId,
  balance,
  status,
  hashscanUrl,
  onUpdate,
  onDelete,
  className,
}: AccountCardProps) {
  const statusVariant =
    status === "ACTIVE"
      ? "default"
      : status === "DELETED"
        ? "destructive"
        : "secondary";

  return (
    <div className={cn("glass-card p-4 space-y-3", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="font-mono text-sm font-medium">{accountId}</p>
          <Badge variant={statusVariant}>{status}</Badge>
        </div>
        {hashscanUrl && (
          <a
            href={hashscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Balance</p>
        <p className="text-lg font-semibold">{balance} ℏ</p>
      </div>

      <div className="flex gap-2">
        {onUpdate && (
          <Button variant="outline" size="sm" onClick={onUpdate}>
            <Pencil className="size-3" />
            Update
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
