import { cn } from "@/lib/utils";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";

type StatusVariant = "success" | "warning" | "error" | "info" | "neutral";

const dotColors: Record<StatusVariant, string> = {
  success: "bg-success-500",
  warning: "bg-warning-500",
  error: "bg-error-500",
  info: "bg-aegis-500",
  neutral: "bg-neutral-400",
};

const badgeVariantMap: Record<StatusVariant, VariantProps<typeof badgeVariants>["variant"]> = {
  success: "success",
  warning: "warning",
  error: "error",
  info: "info",
  neutral: "neutral",
};

interface StatusBadgeProps {
  status: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  return (
    <Badge variant={badgeVariantMap[status]} className={cn("gap-1.5", className)}>
      <span
        className={cn("size-1.5 shrink-0 rounded-full", dotColors[status])}
        aria-hidden="true"
      />
      {children}
    </Badge>
  );
}
