import { cn } from "@/lib/utils";

interface GradientTextProps {
  children: React.ReactNode;
  as?: React.ElementType;
  className?: string;
}

export function GradientText({
  children,
  as: Component = "span",
  className,
}: GradientTextProps) {
  return (
    <Component className={cn("gradient-text", className)}>
      {children}
    </Component>
  );
}
