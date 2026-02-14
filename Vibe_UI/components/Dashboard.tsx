"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAccount, useDisconnect } from "wagmi";
import { ConnectButton } from "./ConnectButton";
import { shortAddress } from "../utils/format";
import { BUY_VIBE_URL, CONTRACT_URL } from "../utils/publicLinks";
import { useVibeBalance } from "../hooks/useVibeBalance";

type Transaction = {
  id: string;
  type: "Buy" | "Transfer" | "Reward";
  amount: string;
  status: "Confirmed" | "Pending";
  when: string;
};

const RECENT_TRANSACTIONS: Transaction[] = [
  { id: "0x8f3a...39b2", type: "Buy", amount: "+1,250 VIBE", status: "Confirmed", when: "2h ago" },
  { id: "0xd4bc...a7e1", type: "Transfer", amount: "-320 VIBE", status: "Confirmed", when: "Yesterday" },
  { id: "0x1ab9...09c4", type: "Reward", amount: "+85 VIBE", status: "Pending", when: "Yesterday" }
];

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/20 border border-white/10 p-3">
      <div className="text-xs uppercase tracking-wider text-white/60">{label}</div>
      <div className="mt-1 text-sm font-medium text-white/90">{value}</div>
    </div>
  );
}

function normalizeAddress(value?: string) {
  return value?.toLowerCase();
}

function parseBalance(displayBalance: string) {
  const numeric = Number(displayBalance.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : undefined;
}

export default function Dashboard({ routeAddress }: { routeAddress?: string }) {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { displayBalance } = useVibeBalance(address);

  const normalizedConnectedAddress = normalizeAddress(address);
  const normalizedRouteAddress = normalizeAddress(routeAddress);

  React.useEffect(() => {
    if (!isConnected || !normalizedConnectedAddress) return;
    const ownRoute = `/app/${normalizedConnectedAddress}`;

    if (!normalizedRouteAddress) {
      router.replace(ownRoute);
      return;
    }

    if (normalizedRouteAddress !== normalizedConnectedAddress) {
      router.replace(ownRoute);
    }
  }, [isConnected, normalizedConnectedAddress, normalizedRouteAddress, router]);

  const marketPrice = Number(process.env.NEXT_PUBLIC_VIBE_PRICE_USD);
  const dailyChange = Number(process.env.NEXT_PUBLIC_VIBE_24H_CHANGE);
  const hasMarketPrice = Number.isFinite(marketPrice) && marketPrice > 0;
  const hasDailyChange = Number.isFinite(dailyChange);
  const hasMarketData = hasMarketPrice && hasDailyChange;

  const rawBalance = parseBalance(displayBalance);
  const holdingValue = hasMarketPrice && rawBalance != null ? rawBalance * marketPrice : undefined;
  const vibeBalance = isConnected ? displayBalance : "—";
  const estValue = holdingValue == null ? "—" : `$${holdingValue.toFixed(2)}`;
  const glassPanel = "rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md shadow-[0_20px_80px_rgba(0,0,0,0.55)]";

  async function copyWallet() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0B1020] via-[#0B1020] to-black text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <div className="text-lg font-semibold tracking-tight">VIBE</div>
            <div className="text-white/60 text-sm">Financial Hub</div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/80">Base</div>
            <button
              type="button"
              onClick={copyWallet}
              className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/80"
            >
              {address ? shortAddress(address) : "Connect wallet"}
            </button>
            {isConnected ? (
              <button
                type="button"
                onClick={() => disconnect()}
                className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/80"
              >
                Disconnect
              </button>
            ) : (
              <div className="scale-[0.9] origin-right">
                <ConnectButton
                  onConnected={() => {
                    if (!normalizedConnectedAddress) return;
                    router.push(`/app/${normalizedConnectedAddress}`);
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 p-6 ${glassPanel}`}>
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-white/60">Portfolio</div>
                <div className="text-3xl md:text-4xl font-semibold tracking-tight">
                  {estValue} <span className="text-white/60 text-lg">USD</span>
                </div>
                <div className="text-sm text-white/60">
                  VIBE balance: <span className="text-white/90">{vibeBalance}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <a
                  href={BUY_VIBE_URL || CONTRACT_URL || "#"}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="px-4 py-2 rounded-xl bg-white text-black text-sm font-medium"
                >
                  Buy VIBE
                </a>
                <button className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/90">Transfer</button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <KPI label="Price" value={hasMarketPrice ? `$${marketPrice.toFixed(4)}` : "—"} />
              <KPI
                label="24h"
                value={hasDailyChange ? `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(2)}%` : "—"}
              />
              <KPI label="Est. Yield" value="—" />
              <KPI label="Network" value="Base" />
            </div>
          </div>

          <div className={`p-6 ${glassPanel}`}>
            <div className="text-xs uppercase tracking-wider text-white/60">Market</div>
            <div className="mt-2 text-lg font-semibold tracking-tight">Data</div>

            {!hasMarketData ? (
              <div className="mt-3 rounded-xl bg-black/20 border border-white/10 p-4">
                <div className="text-sm font-medium">Market data unavailable</div>
                <div className="mt-1 text-sm text-white/60">Set up a price source to display live metrics.</div>
                <button className="mt-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm">View setup</button>
              </div>
            ) : (
              <div className="mt-3 text-sm text-white/70">
                Price: ${marketPrice.toFixed(4)} | 24h: {dailyChange >= 0 ? "+" : ""}
                {dailyChange.toFixed(2)}%
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-2 p-6 ${glassPanel}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-white/60">Activity</div>
                <div className="text-lg font-semibold tracking-tight mt-1">Recent transactions</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {RECENT_TRANSACTIONS.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div>
                    <div className="text-sm text-white/90">{tx.type}</div>
                    <div className="text-xs text-white/60 font-mono">{tx.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-white/90">{tx.amount}</div>
                    <div className="text-xs text-white/60">
                      {tx.status} • {tx.when}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`p-6 ${glassPanel}`}>
            <div className="text-xs uppercase tracking-wider text-white/60">Wallet</div>
            <div className="mt-2 text-lg font-semibold tracking-tight">Actions</div>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={() => router.push("/my-vibe")}
                className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-left"
              >
                Go to MY VIBE
              </button>
              {isConnected ? (
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="w-full px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-left"
                >
                  Disconnect wallet
                </button>
              ) : (
                <div>
                  <ConnectButton
                    onConnected={() => {
                      if (!normalizedConnectedAddress) return;
                      router.push(`/app/${normalizedConnectedAddress}`);
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
