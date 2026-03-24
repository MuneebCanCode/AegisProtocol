"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Wallet,
  KeyRound,
  ShieldCheck,
  ArrowLeftRight,
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
  PanelLeftClose,
  PanelLeft,
  Shield,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/accounts", label: "Accounts", icon: Wallet },
  { href: "/dashboard/keys", label: "Keys", icon: KeyRound },
  { href: "/dashboard/guardians", label: "Guardians", icon: ShieldCheck },
  { href: "/dashboard/transactions", label: "Transactions", icon: ArrowLeftRight },
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

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 border-r border-border bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
        <Shield className="size-6 text-primary shrink-0" />
        {!collapsed && (
          <span className="font-bold text-lg gradient-text truncate">AEGIS</span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-border p-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="w-full"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>
    </aside>
  );
}
