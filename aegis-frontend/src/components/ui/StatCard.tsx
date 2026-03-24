"use client";

import type { LucideIcon } from "lucide-react";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function StatCard({
  title,
  value,
  icon: Icon,
  prefix,
  suffix,
  className,
}: StatCardProps) {
  return (
    <div className={cn("glass-card p-4", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-bold">
        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
        />
      </div>
    </div>
  );
}
