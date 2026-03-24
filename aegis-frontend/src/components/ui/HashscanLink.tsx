"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const HASHSCAN_BASE = "https://hashscan.io/testnet";

interface HashscanLinkProps {
  transactionId?: string;
  entityId?: string;
  type: "transaction" | "account" | "token" | "topic";
  label?: string;
  className?: string;
}

export function HashscanLink({
  transactionId,
  entityId,
  type,
  label,
  className,
}: HashscanLinkProps) {
  const id = transactionId || entityId;
  if (!id) return null;

  const pathMap: Record<string, string> = {
    transaction: "transaction",
    account: "account",
    token: "token",
    topic: "topic",
  };

  const href = `${HASHSCAN_BASE}/${pathMap[type]}/${id}`;
  const displayLabel = label || id;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 text-sm text-primary hover:underline",
        className
      )}
    >
      {displayLabel}
      <ExternalLink className="size-3" />
    </a>
  );
}
