const absoluteUrlPattern = /^https?:\/\//i;
const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;

function asAbsoluteUrl(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || !absoluteUrlPattern.test(trimmed)) return undefined;
  return trimmed;
}

export const HOME_URL = "/";
export const APP_URL = "/app";
export const VIBE_WORLD_URL = "/vibe-world";

export const X_URL = asAbsoluteUrl(process.env.NEXT_PUBLIC_X_URL);
export const DISCORD_URL = asAbsoluteUrl(process.env.NEXT_PUBLIC_DISCORD_URL);
export const WHITEPAPER_URL = asAbsoluteUrl(process.env.NEXT_PUBLIC_WHITEPAPER_URL);

function contractUrlFromEnv(): string | undefined {
  const explicit = asAbsoluteUrl(process.env.NEXT_PUBLIC_CONTRACT_URL);
  if (explicit) return explicit;

  const tokenAddress = process.env.NEXT_PUBLIC_VIBE_TOKEN_ADDRESS?.trim();
  if (!tokenAddress || !evmAddressPattern.test(tokenAddress)) return undefined;

  return `https://sepolia.etherscan.io/address/${tokenAddress}`;
}

export const CONTRACT_URL = contractUrlFromEnv();
export const BUY_VIBE_URL = asAbsoluteUrl(process.env.NEXT_PUBLIC_BUY_VIBE_URL);
