import { createConfig } from "wagmi";
import { http } from "viem";
import { mainnet, sepolia, base, arbitrum, optimism } from "wagmi/chains";

export const chains = [mainnet, sepolia, base, arbitrum, optimism] as const;

export const config = createConfig({
  chains,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http()
  },
  ssr: false
});
