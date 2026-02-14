# VIBE (Next.js Hybrid)

## Why hybrid
- `/` landing: static + fast
- `/app`: client-only wallet dashboard

## Setup
1) Install
- `npm i`

2) Create `.env.local`
- Copy `.env.example` -> `.env.local`
- Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- Optional: set `NEXT_PUBLIC_CONTRACT_URL`, `NEXT_PUBLIC_X_URL`, `NEXT_PUBLIC_DISCORD_URL`

3) Run
- `npm run dev`
- Open `http://localhost:3000`
