# Vibe Project – Agent Playbook (Frontend + Social)

This is a step‑by‑step execution script for an AI agent (or a developer) to build and ship a production‑ready frontend for the Vibe project and to prepare social presence. It assumes the contracts are deployed on Sepolia and verified.

Goals
- Launch a responsive website with wallet connect, mint flows (ETH + VIBE), balances, NFT gallery, and basic admin ops.
- Prepare brand assets, copy, and content plan.
- Create and configure social accounts (manual/assisted) and publish initial posts.

Inputs (required)
- Chain: Sepolia (chainId: 11155111)
- Addresses:
  - VIBE_ADDRESS: 0x65b3265Ae471c629C5482e517d4d31385Af337E7
  - RENDERER_ADDRESS: 0x6365219C4E37bbAeE8b566ABF0704b4034d20e66
  - SOUL_ADDRESS: 0x224A325adB0B1d5332fE88a035eEf1BCD8607Bfb
- Local repo with `artifacts/` present (ABIs) or access to verified ABIs on Etherscan.
- App host: Vercel (recommended) or Netlify.

Tech Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- wagmi + viem + RainbowKit (wallet connect)
- Vercel for hosting and preview deployments

Deliverables
1) Frontend in `frontend/` folder
2) Deployed site (e.g., https://vibe.example.com)
3) Social accounts set up with branding and first posts
4) Documentation: runbook + .env template

Repository Conventions
- Don’t modify contracts. Use ABIs from `artifacts/` or Etherscan.
- Keep frontend isolated under `frontend/`.
- Use `.env.local` for the frontend; never commit secrets.

---

Step 1 — Scaffold Frontend
Commands
```
mkdir -p frontend && cd frontend
npx create-next-app@latest . --ts --eslint --src-dir --app --tailwind --import-alias "@/*"
npm i wagmi viem @rainbow-me/rainbowkit
```

Create `frontend/.env.local` (example)
```
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_VIBE_ADDRESS=0x65b3265Ae471c629C5482e517d4d31385Af337E7
NEXT_PUBLIC_RENDERER_ADDRESS=0x6365219C4E37bbAeE8b566ABF0704b4034d20e66
NEXT_PUBLIC_SOUL_ADDRESS=0x224A325adB0B1d5332fE88a035eEf1BCD8607Bfb
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
```

ABIs
- Copy ABIs from root `artifacts/`:
  - `artifacts/contracts/VibeToken.sol/VibeToken.json`
  - `artifacts/contracts/SoulArcanaNFT.sol/SoulArcanaNFT.json`
- Place into `frontend/abis/` as `VibeToken.json` and `SoulArcanaNFT.json` (keep only the `abi` field if desired).

Step 2 — Configure wagmi + RainbowKit
Create `frontend/src/app/providers.tsx` with wagmi config for Sepolia, RainbowKit provider, and theme. Use `NEXT_PUBLIC_RPC_URL`.

Step 3 — Core Pages & Components
Implement these views in `frontend/src/app/`:
- `/` Home: hero, features, CTA buttons (Mint, View Gallery).
- `/mint` Mint page:
  - Connect wallet
  - Read `mintPriceETH`, `mintPriceVIBE`
  - Buttons: Mint with ETH (qty selector), Mint with VIBE (approve + mintWithVibe)
  - Show tx hash links to Etherscan
- `/wallet` Dashboard:
  - VIBE balance, dividendsOwing, Claim Dividends
  - Recent SoulArcana tokens owned: decode `tokenURI` (Base64 JSON) and render SVG image
- `/admin` (owner‑only guards):
  - Toggle `tradingEnabled`, set `limits`, set `fees`
  - Set NFT prices via `setPrices`

Utilities
- viem read/write hooks for:
  - Vibe: `name`, `symbol`, `balanceOf`, `dividendsOwing`, `claimDividends`, `setTradingEnabled`, `setLimits`, `setFees`
  - Soul: `mint`, `mintWithVibe`, `mintPriceETH`, `mintPriceVIBE`, `tokenOfOwnerByIndex`, `tokenURI`, `setPrices`
- Helper to decode Base64 JSON and embed SVG image URLs.

Acceptance Criteria
- Connect works on Sepolia; addresses match env.
- ETH mint and VIBE mint succeed and display tx links.
- Wallet dashboard shows balances and latest NFT preview.
- Owner‑only actions fail for non‑owners and succeed for the owner.

Step 4 — Styles & Branding
Brand brief
- Theme: mystical arcana + modern crypto; dark background, vibrant accent.
- Palette: background #0B0F19, accent #8B5CF6 (violet), secondary #22D3EE (cyan), text #E5E7EB.
- Fonts: Inter (body), JetBrains Mono (code accents).

Assets
- Generate a simple logomark (e.g., stylized “V” sigil) and a wordmark “Vibe”. Save under `frontend/public/`.
- Create social headers at 1500x500 (X), 1080x608 (IG story canvas), 1200x630 (OG image).

Step 5 — Metadata & SEO
- Add `metadata` in `layout.tsx` (title, description, OG tags, Twitter card).
- Add `sitemap.xml` and `robots.txt` via `next-sitemap` or static files.

Step 6 — Deploy
Vercel
- Create new project from the repo, set build root to `frontend/`.
- Env vars: copy `.env.local` values to Vercel.
- Build command: `npm run build`; output: `.next`.
- After deploy, validate wallet connect and mint flows on Sepolia.

Step 7 — Documentation
- Add `frontend/README.md` with setup, env, commands, and feature tour.

---

Social Setup (Manual or Assisted)
Note: Account creation often requires human verification (phone/2FA). The agent should prepare assets and copy, but account creation might need the owner to complete.

Proposed Handles
- X (Twitter): @VibeToken
- Instagram: @vibe.token
- Facebook Page: Vibe Token
- Reddit: r/VibeToken

Profiles
- Bio (short): “VibeToken (VIBE) + SoulArcana NFTs. On‑chain art and good vibes. Sepolia testnet for now. DYOR. ✨”
- Website: your deployed site URL
- Location: Internet
- Linktree alternative: add Links page on the site `/links` with all official links.

Initial Posts (ready‑to‑publish)
1) Launch Post (X/FB/IG/Reddit)
  - “We’re live on Sepolia: VibeToken + SoulArcana NFTs. Mint on testnet, decode on‑chain art, and share your arcana. Docs + repo inside. #VIBE #NFT #Web3 #Sepolia”
2) How‑to Mint (thread/carousel)
  - “Connect wallet → Mint with ETH or with VIBE (approve + mint) → View your on‑chain SVG. Full guide on the site.”
3) Tech Deep Dive
  - “VibeToken includes fee + reflection mechanics; SoulArcana uses an on‑chain SVG renderer. Verified on Etherscan. Read more on GitHub.”
4) Weekly Update
  - “This week: site launched, interactions script added, coverage passing. Next: UI polish + community Q&A.”

Posting Cadence
- Week 1: 3–4 posts total across platforms (don’t spam). Then 2/week.
- Cross‑post, but tailor captions per platform; include visuals (screenshots of mint flow, NFT previews).

Community Guidelines
- Keep responses helpful and respectful.
- No promises of price/performance. Educational tone only.
- Report phishing. Only trust links listed on the official site.

Automation (Optional)
- Use Buffer or Hootsuite to schedule the first week of posts.
- Store API keys in a secure vault. Do not commit.

---

Runbook (One‑Liners)
- Dev
  - `cd frontend && npm run dev`
- Build
  - `cd frontend && npm run build && npm run start`
- Lint/Format
  - `cd frontend && npm run lint && npm run format` (add Prettier as needed)
- Env
  - Copy `.env.local` template from this playbook’s example and update addresses.

Done Criteria
- Frontend deployed and functional on Sepolia.
- Social accounts created and branded, first posts published.
- README/Docs updated with links and screenshots.

