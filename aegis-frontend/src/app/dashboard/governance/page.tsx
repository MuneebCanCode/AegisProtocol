"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Vote, Coins, ThumbsUp, ThumbsDown, CheckCircle2, Clock } from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { staggerContainer, staggerItem } from "@/lib/animations";

// --- Types ---

interface Proposal {
  id: string;
  title: string;
  description: string;
  status: "ACTIVE" | "COMPLETED";
  votesFor: number;
  votesAgainst: number;
  endDate: string;
  userVoted: boolean;
}

interface GovernanceData {
  tokenBalance: number;
  proposals: Proposal[];
}

// --- Mock data ---

const MOCK_GOVERNANCE: GovernanceData = {
  tokenBalance: 2500,
  proposals: [
    {
      id: "prop-001",
      title: "Increase Insurance Pool Cap to 200,000 ℏ",
      description: "Proposal to raise the maximum insurance pool balance from 100,000 ℏ to 200,000 ℏ to provide better coverage for all participants.",
      status: "ACTIVE",
      votesFor: 15200,
      votesAgainst: 3800,
      endDate: "2024-02-01T00:00:00Z",
      userVoted: false,
    },
    {
      id: "prop-002",
      title: "Reduce Key Rotation Grace Period to 7 Days",
      description: "Proposal to shorten the grace period for old key deletion after rotation from 30 days to 7 days for improved security posture.",
      status: "COMPLETED",
      votesFor: 22000,
      votesAgainst: 8500,
      endDate: "2024-01-15T00:00:00Z",
      userVoted: true,
    },
  ],
};

// --- Hooks ---

function useGovernance() {
  const [data, setData] = useState<GovernanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setData(MOCK_GOVERNANCE);
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return { data, loading, setData };
}

// --- Skeletons ---

function GovernanceSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton-shimmer h-24 rounded-xl" />
      <div className="skeleton-shimmer h-48 rounded-xl" />
      <div className="skeleton-shimmer h-48 rounded-xl" />
    </div>
  );
}

// --- Page ---

export default function GovernancePage() {
  const { data, loading, setData } = useGovernance();

  const handleVote = (proposalId: string, vote: "for" | "against") => {
    if (!data) return;
    setData({
      ...data,
      proposals: data.proposals.map((p) =>
        p.id === proposalId
          ? {
              ...p,
              userVoted: true,
              votesFor: vote === "for" ? p.votesFor + data.tokenBalance : p.votesFor,
              votesAgainst: vote === "against" ? p.votesAgainst + data.tokenBalance : p.votesAgainst,
            }
          : p
      ),
    });
  };

  return (
    <PageTransition>
      <div className="space-y-6">
        <PageHeader
          title="Governance"
          description="Vote on protocol proposals with your AEGIS Governance Tokens"
        />

        {loading && <GovernanceSkeleton />}

        {!loading && data && (
          <motion.div
            className="space-y-6"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {/* Token balance */}
            <motion.div variants={staggerItem}>
              <StatCard
                title="AEGIS Governance Tokens"
                value={data.tokenBalance}
                icon={Coins}
              />
            </motion.div>

            {/* Proposals */}
            <motion.div variants={staggerItem}>
              <h2 className="text-lg font-semibold mb-3">Proposals</h2>
            </motion.div>

            {data.proposals.map((proposal) => {
              const totalVotes = proposal.votesFor + proposal.votesAgainst;
              const forPercent = totalVotes > 0 ? (proposal.votesFor / totalVotes) * 100 : 0;

              return (
                <motion.div key={proposal.id} variants={staggerItem}>
                  <div className="glass-card p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="font-semibold">{proposal.title}</h3>
                        <p className="text-sm text-muted-foreground">{proposal.description}</p>
                      </div>
                      <Badge variant={proposal.status === "ACTIVE" ? "success" : "neutral"}>
                        {proposal.status === "ACTIVE" ? (
                          <><Clock className="size-3 mr-1" /> Active</>
                        ) : (
                          <><CheckCircle2 className="size-3 mr-1" /> Completed</>
                        )}
                      </Badge>
                    </div>

                    {/* Vote bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600 dark:text-green-400">
                          For: {proposal.votesFor.toLocaleString()}
                        </span>
                        <span className="text-red-600 dark:text-red-400">
                          Against: {proposal.votesAgainst.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-red-200 dark:bg-red-900/30 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all duration-700"
                          style={{ width: `${forPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Voting buttons */}
                    {proposal.status === "ACTIVE" && (
                      <div className="flex items-center gap-3 pt-2 border-t border-border/50">
                        {proposal.userVoted ? (
                          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <CheckCircle2 className="size-4 text-green-500" />
                            You have voted on this proposal
                          </span>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVote(proposal.id, "for")}
                            >
                              <ThumbsUp className="size-3.5 mr-1.5" />
                              Vote For
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVote(proposal.id, "against")}
                            >
                              <ThumbsDown className="size-3.5 mr-1.5" />
                              Vote Against
                            </Button>
                            <span className="text-xs text-muted-foreground ml-auto">
                              Your vote weight: {data.tokenBalance.toLocaleString()} tokens
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      {proposal.status === "ACTIVE" ? "Ends" : "Ended"}:{" "}
                      {new Date(proposal.endDate).toLocaleDateString()}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
