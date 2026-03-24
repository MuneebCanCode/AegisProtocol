"use client";

import { cn } from "@/lib/utils";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
}

export function GlowCard({ children, className }: GlowCardProps) {
  return (
    <div
      className={cn(
        "glass-card p-4 transition-shadow duration-300 hover:glow",
        className
      )}
    >
      {children}
    </div>
  );
}
