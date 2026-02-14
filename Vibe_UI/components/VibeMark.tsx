"use client";

import React from "react";
import { motion } from "framer-motion";

export function VibeMark({ size = 160 }: { size?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1.2, ease: "easeOut" }}
      className="relative"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div
        className="absolute inset-0 rounded-3xl blur-2xl opacity-50"
        style={{ background: "radial-gradient(circle at 50% 40%, rgba(160,110,255,0.8), transparent 60%)" }}
      />
      <svg viewBox="0 0 200 240" className="relative drop-shadow-[0_30px_80px_rgba(160,110,255,0.25)]">
        <defs>
          <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(220,200,255,1)" />
            <stop offset="0.5" stopColor="rgba(160,110,255,1)" />
            <stop offset="1" stopColor="rgba(90,110,255,1)" />
          </linearGradient>
        </defs>
        <path d="M100 10 L180 110 L100 140 L20 110 Z" fill="url(#g)" opacity="0.9" />
        <path d="M100 140 L180 110 L100 230 L20 110 Z" fill="url(#g)" opacity="0.75" />
        <path
          d="M100 52 L146 110 L100 125 L54 110 Z"
          fill="rgba(10,8,18,0.65)"
          stroke="rgba(255,255,255,0.12)"
        />
        <path d="M20 110 L100 10 L180 110" fill="none" stroke="rgba(255,255,255,0.16)" />
        <path d="M20 110 L100 230 L180 110" fill="none" stroke="rgba(255,255,255,0.10)" />
      </svg>
    </motion.div>
  );
}
