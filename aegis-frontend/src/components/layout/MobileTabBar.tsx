"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Wallet,
  KeyRound,
  ArrowLeftRight,
  MoreHorizontal,
  ShieldCheck,
  FileText,
  RotateCcw,
  HeartPulse,
  Timer,
  HandCoins,
  ShieldPlus,
  ScrollText,
  Vote,
  Landmark,
  ClipboardCheck,
  Settings,
} from "lucide-react";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const primaryTabs = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: Wallet },
  { href: "/dashboard/keys", label: "Keys", icon: KeyRound },
  { href: "/dashboard/transactions", label: "Txns", icon: ArrowLeftRight },
];

const moreLinks = [
  { href: "/dashboard/guardians", label: "Guardians", icon: ShieldCheck },
  { href: "/dashboard/policies", label: "Policies", icon: FileText },
  { href: "/dashboard/rotation", label: "Rotation", icon: RotateCcw },
  { href: "/dashboard/recovery", label: "Recovery", icon: HeartPulse },
  { href: "/dashboard/deadman", label: "Dead Man Switch", icon: Timer },
  { href: "/dashboard/allowances", label: "Allowances", icon: HandCoins },
  { href: "/dashboard/insurance", label: "Insurance", icon: ShieldPlus },
  { href: "/dashboard/audit", label: "Audit Logs", icon: ScrollText },
  { href: "/dashboard/governance", label: "Governance", icon: Vote },
  { href: "/dashboard/staking", label: "Staking", icon: Landmark },
  { href: "/dashboard/compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function MobileTabBar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  const isMoreActive = moreLinks.some((link) => pathname.startsWith(link.href));

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background">
      <div className="flex items-center justify-around h-14">
        {primaryTabs.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors",
              isActive(href)
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <Icon className="size-5" />
            <span>{label}</span>
          </Link>
        ))}

        {/* More sheet trigger */}
        <Sheet>
          <SheetTrigger
            className={cn(
              "flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition-colors",
              isMoreActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="size-5" />
            <span>More</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[70vh]">
            <SheetHeader>
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 p-4 overflow-y-auto">
              {moreLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg p-3 text-xs font-medium transition-colors",
                    isActive(href)
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="size-5" />
                  <span className="text-center">{label}</span>
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
