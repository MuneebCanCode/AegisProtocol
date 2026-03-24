"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Key } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { KeyDNACard } from "@/components/ui/KeyDNACard";
import { EmptyState } from "@/components/ui/EmptyState";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { apiClient } from "@/lib/api-client";
import toast from "react-hot-toast";

// --- Types ---

interface ManagedKey {
  id: string;
  alias: string;
  algorithm: string;
  publicKey: string;
  healthScore: number;
  status: string;
  hashscanUrl: string;
}

// --- Hooks ---

function useKeys() {
  const [keys, setKeys] = useState<ManagedKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<any[]>("/api/keys");
      const mapped = (res.data ?? []).map((k: any) => ({
        id: k.id,
        alias: k.kmsKeyAlias ?? "KMS Key",
        algorithm: "ECC_SECG_P256K1",
        publicKey: k.publicKey,
        healthScore: k.healthScore ?? 100,
        status: k.status,
        hashscanUrl: "",
      }));
      setKeys(mapped);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  return { keys, loading, setKeys, refetch: fetchKeys };
}

// --- Skeletons ---

function KeyCardSkeleton() {
  return <div className="skeleton-shimmer h-56 w-full rounded-xl" />;
}

// --- Page ---

export default function KeysPage() {
  const { keys, loading, setKeys, refetch } = useKeys();
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      await apiClient.post("/api/keys");
      toast.success("Key generated successfully");
      await refetch();
    } catch {
      // toast already shown by apiClient
    } finally {
      setGenerating(false);
    }
  }, [refetch]);

  const handleRotate = useCallback((id: string) => {
    console.log("Rotate key", id);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await apiClient.delete(`/api/keys/${id}`);
      toast.success("Key scheduled for deletion");
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      // toast already shown by apiClient
    }
  }, [setKeys]);

  const hasKeys = !loading && keys.length > 0;
  const isEmpty = !loading && keys.length === 0;

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Managed Keys"
          description="KMS-backed cryptographic keys with health monitoring"
          actionLabel={generating ? "Generating..." : "Generate Key"}
          onAction={handleGenerate}
        />

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <KeyCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <EmptyState
            icon={Key}
            title="No managed keys"
            description="Generate your first KMS-backed key to get started."
          />
        )}

        {/* Key cards grid */}
        {hasKeys && (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {keys.map((key) => (
              <motion.div key={key.id} variants={staggerItem}>
                <KeyDNACard
                  keyId={key.id}
                  alias={key.alias}
                  algorithm={key.algorithm}
                  publicKey={key.publicKey}
                  healthScore={key.healthScore}
                  status={key.status}
                  hashscanUrl={key.hashscanUrl}
                  onRotate={() => handleRotate(key.id)}
                  onDelete={() => handleDelete(key.id)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
