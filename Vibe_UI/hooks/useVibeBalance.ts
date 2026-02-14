"use client";

import { useMemo } from "react";
import type { Address } from "viem";
import { formatUnits } from "viem";
import { useReadContract } from "wagmi";
import { asAddress, erc20Abi } from "../web3/erc20";

export function useVibeBalance(account?: Address) {
  const token = asAddress(process.env.NEXT_PUBLIC_VIBE_TOKEN_ADDRESS);

  const enabled = Boolean(token && account);

  const { data: decimals } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: "decimals",
    query: { enabled: Boolean(token) }
  });

  const { data: symbol } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: "symbol",
    query: { enabled: Boolean(token) }
  });

  const { data: balance } = useReadContract({
    abi: erc20Abi,
    address: token,
    functionName: "balanceOf",
    args: account ? [account] : undefined,
    query: { enabled }
  });

  const displayBalance = useMemo(() => {
    if (!token || !account) return "—";
    if (balance == null || decimals == null) return "…";
    const v = Number(formatUnits(balance, decimals));
    const rounded = v >= 1000 ? v.toFixed(0) : v >= 1 ? v.toFixed(2) : v.toFixed(4);
    return `${rounded}${symbol ? ` ${symbol}` : ""}`;
  }, [account, balance, decimals, symbol, token]);

  return { displayBalance };
}
