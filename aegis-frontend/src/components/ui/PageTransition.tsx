"use client";

import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/animations";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
