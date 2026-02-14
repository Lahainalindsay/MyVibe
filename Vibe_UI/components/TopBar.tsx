"use client";

import React from "react";
import { useAccount } from "wagmi";
import { Copy } from "lucide-react";
import { shortAddress } from "../utils/format";
import { useVibeBalance } from "../hooks/useVibeBalance";

export function TopBar() {
  const { address } = useAccount();
  const { displayBalance } = useVibeBalance(address);

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
  }

  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
      <button
        type="button"
        onClick={copy}
        className="flex items-center gap-2 text-xs text-white/70 hover:text-white/90 transition"
        title="Click to copy"
      >
        <span className="font-mono">{address ? shortAddress(address) : "—"}</span>
        <Copy size={14} />
      </button>

      <div className="text-xs text-white/70">
        <span className="text-white/50">VIBE Balance:</span> <span className="text-white/85">{displayBalance}</span>
      </div>
    </div>
  );
}
