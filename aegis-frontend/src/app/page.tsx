"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield,
  Key,
  Users,
  FileText,
  Activity,
  Vote,
  ArrowRight,
  Lock,
  Zap,
  CheckCircle,
  Server,
  Globe,
} from "lucide-react";
import { PageTransition } from "@/components/ui/PageTransition";
import { GradientText } from "@/components/ui/GradientText";
import { GlowCard } from "@/components/ui/GlowCard";
import { Button } from "@/components/ui/button";
import {
  fadeInUp,
  staggerContainer,
  staggerItem,
} from "@/lib/animations";

const features = [
  {
    icon: Key,
    title: "Key Management",
    description:
      "Generate and manage secp256k1 keys backed by AWS KMS HSMs. Private keys never leave the hardware boundary.",
  },
  {
    icon: Users,
    title: "Guardian System",
    description:
      "Assign guardians with NFT-backed authority for threshold-based social recovery of your accounts.",
  },
  {
    icon: Shield,
    title: "Smart Policies",
    description:
      "Enforce transaction rules via onchain smart contracts with configurable limits and whitelists.",
  },
  {
    icon: FileText,
    title: "Audit Trail",
    description:
      "Every action is recorded on Hedera Consensus Service topics with KMS-signed, tamper-proof messages.",
  },
  {
    icon: Activity,
    title: "Health Scores",
    description:
      "Monitor key hygiene with a weighted 0-100 score across 9 security dimensions. Stay ahead of risks.",
  },
  {
    icon: Vote,
    title: "Governance",
    description:
      "Participate in protocol decisions with token-weighted voting recorded immutably on Hedera.",
  },
];

const stats = [
  { label: "Enterprise-Grade Security", icon: Lock },
  { label: "20+ Hedera Services", icon: Globe },
  { label: "Real-Time Audit Trail", icon: Zap },
];

const steps = [
  {
    number: "01",
    title: "Create Account",
    description:
      "Register and set up your AEGIS profile with secure JWT authentication.",
  },
  {
    number: "02",
    title: "Generate Keys",
    description:
      "Create KMS-backed secp256k1 keys and Hedera accounts with Key DNA NFTs.",
  },
  {
    number: "03",
    title: "Manage Assets",
    description:
      "Transfer HBAR, assign guardians, set policies, and monitor compliance from your dashboard.",
  },
];

export default function LandingPage() {
  return (
    <PageTransition>
      <div className="min-h-screen bg-background text-foreground">
        {/* Navbar */}
        <nav className="sticky top-0 z-50 glass-card border-b border-border/50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <Shield className="h-8 w-8 text-primary" />
                <span className="text-xl font-bold">
                  <GradientText>AEGIS</GradientText>
                </span>
              </Link>
              <div className="flex items-center gap-3">
                <Link href="/login">
                  <Button variant="ghost" size="lg">
                    Login
                  </Button>
                </Link>
                <Link href="/register">
                  <Button variant="gradient" size="lg">
                    Get Started
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative overflow-hidden py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            <motion.div
              variants={fadeInUp}
              initial="hidden"
              animate="visible"
            >
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
                Secure Key Management
                <br />
                on <GradientText>Hedera</GradientText>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                Enterprise-grade cryptographic key lifecycle management powered
                by AWS KMS hardware security modules and the Hedera network.
                Your private keys never leave the HSM.
              </p>
              <div className="mt-10 flex items-center justify-center gap-4">
                <Link href="/register">
                  <Button variant="gradient" size="lg" className="gap-2 px-6 py-3 h-12 text-base">
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#features">
                  <Button variant="outline" size="lg" className="px-6 py-3 h-12 text-base">
                    Learn More
                  </Button>
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Stats Bar */}
        <motion.section
          className="border-y border-border/50 bg-muted/30 py-8"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
              {stats.map((stat) => (
                <div key={stat.label} className="flex items-center justify-center gap-3">
                  <stat.icon className="h-5 w-5 text-primary" />
                  <span className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Features Grid */}
        <section id="features" className="py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              className="text-center mb-16"
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold">
                Everything You Need for{" "}
                <GradientText>Key Security</GradientText>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
                A comprehensive suite of tools for managing cryptographic keys,
                guardians, policies, and compliance on the Hedera network.
              </p>
            </motion.div>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              {features.map((feature) => (
                <motion.div key={feature.title} variants={staggerItem}>
                  <GlowCard className="h-full p-6">
                    <feature.icon className="h-10 w-10 text-primary mb-4" />
                    <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </GlowCard>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-24 bg-muted/20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              className="text-center mb-16"
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold">
                Get Started in <GradientText>3 Steps</GradientText>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
                From registration to full key lifecycle management in minutes.
              </p>
            </motion.div>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-3 gap-8"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              {steps.map((step) => (
                <motion.div key={step.number} variants={staggerItem}>
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                      <span className="text-xl font-bold gradient-text">
                        {step.number}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Integration Showcase */}
        <section className="py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              className="text-center mb-16"
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold">
                Powered by <GradientText>Industry Leaders</GradientText>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
                Built on battle-tested infrastructure from AWS and Hedera for
                maximum security and reliability.
              </p>
            </motion.div>
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              <motion.div variants={staggerItem}>
                <GlowCard className="p-8 text-center">
                  <Server className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">AWS KMS</h3>
                  <p className="text-sm text-muted-foreground">
                    Hardware Security Modules ensure private keys never leave
                    the HSM boundary. FIPS 140-2 Level 3 validated.
                  </p>
                </GlowCard>
              </motion.div>
              <motion.div variants={staggerItem}>
                <GlowCard className="p-8 text-center">
                  <Globe className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Hedera Network</h3>
                  <p className="text-sm text-muted-foreground">
                    Immutable audit trails, NFT-backed identity, and onchain
                    governance via 20+ Hedera services.
                  </p>
                </GlowCard>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 bg-muted/20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              className="text-center"
              variants={fadeInUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Ready to Secure Your Keys?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto mb-8">
                Start managing your cryptographic keys with enterprise-grade
                security. No private key exposure, ever.
              </p>
              <div className="flex items-center justify-center gap-4">
                <Link href="/register">
                  <Button variant="gradient" size="lg" className="gap-2 px-8 py-3 h-12 text-base">
                    Create Your Account
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" size="lg" className="px-8 py-3 h-12 text-base">
                    View Dashboard
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border/50 py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold">
                  <GradientText>AEGIS Protocol</GradientText>
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Enterprise-grade key management on Hedera. Built with AWS KMS.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </PageTransition>
  );
}
