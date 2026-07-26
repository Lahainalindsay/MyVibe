<div align="center">

# Vibe Project

ERC-20 (`VibeToken`), ERC-721 (`WhatsYourVibeNFT`, ticker VYX), and on-chain SVG renderer (`SigilArcanaOnChainRenderer`) with Hardhat tests and Sepolia deploy/verify scripts.

</div>

---

## Quick Start

1) Prerequisites: Node v18+, npm v9+

```bash
git clone https://github.com/Lahainalindsay/MyVibe.git
cd MyVibe
npm install
```

2) Create `.env` (see `.env.example`). Common values:

```bash
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_KEY

DAO_ADDRESS=0x...
STAKING_ADDRESS=0x...
FAIRLAUNCH_ADDRESS=0x...
INFLUENCER_ADDRESS=0x...
DEPLOYER_ADDRESS=0x...

VIBE_ADDRESS=0x...
RENDERER_ADDRESS=0x...
VYX_ADDRESS=0x...          # WhatsYourVibeNFT (preferred)
# SOUL_ADDRESS=0x...       # legacy alias accepted by verify/mint/wyv scripts
NFT_OWNER_ADDRESS=0x...
```

Scripts that need the NFT address typically resolve  
`VYX_ADDRESS` → `WYV_ADDRESS` → `SOUL_ADDRESS`.

3) Compile, test, deploy:

```bash
npm run build
npm test
npm run deploy:local

npm run deploy:sepolia
npm run verify
```

---

## What’s Inside

- `contracts/`
  - `VibeToken.sol` — ERC-20 with fees, reflections, blacklist, limits, admin controls
  - `WhatsYourVibeNFT.sol` — ERC-721 (pre-reveal placeholder, ETH/VIBE minting, renderer-backed reveal)
  - `SigilArcanaOnChainRenderer.sol` — on-chain SVG/JSON metadata
- `test/` — Hardhat Mocha/Chai suite
- `scripts/`
  - `deploy.js` — Deploys **VibeToken**, **SigilArcanaOnChainRenderer**, and **WhatsYourVibeNFT**, links them, prints `VYX_ADDRESS=...`
  - `verify.js` — Etherscan verification using `.env` addresses
  - Other ops scripts (interact, launch, liquidity, etc. — see table below)
- `hardhat.config.js` — Solidity 0.8.x, networks, Etherscan, gas reporter

---

## npm scripts

| Script | Command purpose |
|--------|-----------------|
| `npm run build` | `hardhat compile` |
| `npm test` | Full test suite |
| `npm run test:strict` | `VibeToken.cooldown.strict.test.js` only |
| `npm run coverage` | solidity-coverage report |
| `npm run check:coverage` | Fail if coverage below thresholds |
| `npm run deploy:local` | `scripts/deploy.js` on in-process Hardhat |
| `npm run deploy:sepolia` | Deploy to Sepolia |
| `npm run verify` | `scripts/verify.js` on Sepolia |
| `npm run interact:sepolia` | `scripts/interact.js` |
| `npm run launch:vibe` | `scripts/launchVibe.js` |
| `npm run hold:nft` | `scripts/holdNFT.js` |
| `npm run simulate:sepolia` | `scripts/simulateSepolia.js` |
| `npm run liquidity:v2:sepolia` | `scripts/addLiquidityV2.js` |
| `npm run tokenomics:distribute` | `scripts/distributeTokenomics.js` |
| `npm run wyv:set-pre-mint` | `scripts/wyvSetPreMint.js` |
| `npm run wyv:set-pre` | `scripts/wyvSetPre.js` |

---

## Environment variables

**Required for Sepolia deploy / verify:** `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY`.

**VibeToken constructor args (verify):** `DAO_ADDRESS`, `STAKING_ADDRESS`, `FAIRLAUNCH_ADDRESS`, `INFLUENCER_ADDRESS`, `DEPLOYER_ADDRESS`.

**Deployed addresses:** `VIBE_ADDRESS`, `RENDERER_ADDRESS`, `VYX_ADDRESS` (or legacy `SOUL_ADDRESS` / `WYV_ADDRESS`), `NFT_OWNER_ADDRESS`.

Keep `.env` out of git.

---

## Development flow

1. Edit contracts under `contracts/`
2. `npm run build` → `npm test`
3. Optional: `npm run coverage` / `npm run check:coverage`
4. `npm run deploy:local`, then Sepolia + `npm run verify`

Frontend notes: `docs/AGENT_FRONTEND_PLAYBOOK.md`.

---

## Troubleshooting

- Missing env vars for Sepolia or Etherscan
- Verification: exact constructor args and addresses
- RPC / Sepolia ETH balance issues

---

## Security notes

- Never commit private keys or real `.env` files
- Treat fee, limit, blacklist, and trading-enable controls as high risk before mainnet
- Double-check constructor addresses (DAO, staking, fairlaunch, influencer, NFT owner) before deploy
- Prefer a dedicated deployer wallet with minimal funds for testnets

---

## Deployments (example Sepolia)

- `VIBE_ADDRESS`: `0x65b3265Ae471c629C5482e517d4d31385Af337E7`
- `RENDERER_ADDRESS`: `0x6365219C4E37bbAeE8b566ABF0704b4034d20e66`
- `VYX_ADDRESS` (WhatsYourVibeNFT): `0x224A325adB0B1d5332fE88a035eEf1BCD8607Bfb`

Update `.env` after your own deploys.

---

## License

MIT — see SPDX identifiers in Solidity sources.

## Acknowledgments

Hardhat, OpenZeppelin Contracts, solidity-coverage.
