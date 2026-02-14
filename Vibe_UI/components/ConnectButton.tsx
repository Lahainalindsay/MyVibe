"use client";

import React from "react";
import { useAccount, useConnect } from "wagmi";
import { clsx } from "clsx";

export function ConnectButton({
  onConnected,
  className,
  label = "Connect Wallet",
  variant = "default"
}: {
  onConnected?: () => void;
  className?: string;
  label?: string;
  variant?: "default" | "hotspot";
}) {
  return <ConnectButtonEnabled onConnected={onConnected} className={className} label={label} variant={variant} />;
}

function ConnectButtonEnabled({
  onConnected,
  className,
  label,
  variant
}: {
  onConnected?: () => void;
  className?: string;
  label: string;
  variant: "default" | "hotspot";
}) {
  const { isConnected } = useAccount();
  const { connectAsync, connectors, isPending } = useConnect();

  React.useEffect(() => {
    if (isConnected) onConnected?.();
  }, [isConnected, onConnected]);

  async function handleConnect() {
    const injectedConnector = connectors.find((connector) => {
      const id = connector.id.toLowerCase();
      const name = connector.name.toLowerCase();
      return connector.type === "injected" || id.includes("injected") || name.includes("metamask") || name.includes("coinbase");
    });

    const connectorToUse = injectedConnector ?? connectors[0];
    if (!connectorToUse) return;

    try {
      await connectAsync({ connector: connectorToUse });
    } catch {
      // User rejected or wallet unavailable.
    }
  }

  return (
    <button
      type="button"
      onClick={handleConnect}
      disabled={isPending}
      className={clsx(
        variant === "hotspot"
          ? "hotspot-btn"
          : "btn-primary rounded-xl px-5 py-3 text-sm tracking-wide text-white shadow-glow transition duration-300",
        isPending ? "opacity-80 cursor-wait" : undefined,
        className
      )}
    >
      <span className={variant === "hotspot" ? "sr-only" : undefined}>{isPending ? "Connecting..." : label}</span>
    </button>
  );
}
