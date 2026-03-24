"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Bell, Palette, Wallet, Save } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { staggerContainer, staggerItem } from "@/lib/animations";
import toast from "react-hot-toast";

// --- Types ---

interface UserProfile {
  name: string;
  email: string;
}

interface ConnectedAccount {
  accountId: string;
  balance: string;
  status: "ACTIVE" | "INACTIVE";
}

interface NotificationPrefs {
  emailAlerts: boolean;
  keyRotationReminders: boolean;
  guardianActivity: boolean;
  policyViolations: boolean;
  complianceReports: boolean;
}

interface SettingsData {
  profile: UserProfile;
  accounts: ConnectedAccount[];
  notifications: NotificationPrefs;
}

// --- Mock data ---

const MOCK_SETTINGS: SettingsData = {
  profile: {
    name: "Demo User",
    email: "demo@aegis.protocol",
  },
  accounts: [
    { accountId: "0.0.12345", balance: "150.00", status: "ACTIVE" },
    { accountId: "0.0.12346", balance: "75.50", status: "ACTIVE" },
    { accountId: "0.0.12347", balance: "0.00", status: "INACTIVE" },
  ],
  notifications: {
    emailAlerts: true,
    keyRotationReminders: true,
    guardianActivity: false,
    policyViolations: true,
    complianceReports: false,
  },
};

// --- Hooks ---

function useSettings() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(MOCK_SETTINGS);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading, setData };
}

// --- Components ---

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-2">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-aegis-500" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

// --- Skeletons ---

function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-shimmer h-48 rounded-xl" />
      ))}
    </div>
  );
}

// --- Page ---

export default function SettingsPage() {
  const { data, loading, setData } = useSettings();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (data) {
      setName(data.profile.name);
      setEmail(data.profile.email);
    }
  }, [data]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!data) return;
    setData({
      ...data,
      profile: { name, email },
    });
    toast.success("Profile updated successfully");
  };

  const handleToggleNotification = (key: keyof NotificationPrefs) => {
    if (!data) return;
    setData({
      ...data,
      notifications: {
        ...data.notifications,
        [key]: !data.notifications[key],
      },
    });
  };

  const notificationLabels: Record<keyof NotificationPrefs, string> = {
    emailAlerts: "Email Alerts",
    keyRotationReminders: "Key Rotation Reminders",
    guardianActivity: "Guardian Activity",
    policyViolations: "Policy Violations",
    complianceReports: "Compliance Reports",
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Manage your profile, preferences, and connected accounts"
        />

        {loading && <SettingsSkeleton />}

        {!loading && data && (
          <motion.div
            className="space-y-6 max-w-2xl"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* User Profile */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <User className="size-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">User Profile</h2>
                </div>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Name</Label>
                    <Input
                      id="profile-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="gradient">
                    <Save className="size-4 mr-1.5" />
                    Save Profile
                  </Button>
                </form>
              </div>
            </motion.div>

            {/* Connected Accounts */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Wallet className="size-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Connected Accounts</h2>
                </div>
                <div className="space-y-2">
                  {data.accounts.map((account) => (
                    <div
                      key={account.accountId}
                      className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm">{account.accountId}</span>
                        <Badge variant={account.status === "ACTIVE" ? "success" : "neutral"}>
                          {account.status}
                        </Badge>
                      </div>
                      <span className="text-sm font-medium">{account.balance} ℏ</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Notification Preferences */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="size-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Notification Preferences</h2>
                </div>
                <div className="divide-y divide-border/50">
                  {(Object.keys(data.notifications) as (keyof NotificationPrefs)[]).map(
                    (key) => (
                      <ToggleSwitch
                        key={key}
                        label={notificationLabels[key]}
                        checked={data.notifications[key]}
                        onChange={() => handleToggleNotification(key)}
                      />
                    )
                  )}
                </div>
              </div>
            </motion.div>

            {/* Theme Settings */}
            <motion.div variants={staggerItem}>
              <div className="glass-card p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Palette className="size-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Theme Settings</h2>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Toggle between dark and light mode</span>
                  <ThemeToggle />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
