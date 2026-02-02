# VIBE Mainnet Launch Runbook

This runbook assumes **token-only** deployment first, with NFTs added later.

## Pre-flight
- Confirm deployer address + funding for gas
- Decide DAO wallet (initially deployer is OK)
- Decide owner (EOA now, move to multisig post-launch)
- Confirm RPC + Etherscan API key in `.env`
- Fill launch/ops env vars in `.env.example` (copy to `.env`), including `VIBE_TOKEN`, optional AMM checks, and launch toggles

## Parameters (exact values used)
- Fees:
  - burn: **200 bps (2.00%)**
  - DAO: **200 bps (2.00%)**
  - reflection: **100 bps (1.00%)**
  - total: **500 bps (5.00%)**
- Limits (initial):
  - maxTx: **2% of total supply** (`20,000,000 VIBE`)
  - maxWallet: **2% of total supply** (`20,000,000 VIBE`)
  - cooldown: **0 seconds**

Optional post-launch relax:
- maxTx/maxWallet → full supply (increase only)
- cooldown → 0 (decrease only)

## Step 1 — Deploy
Token-only deployment (mainnet):
```bash
npx hardhat run scripts/deployTokenMainnet.js --network mainnet
```
Record `VIBE_ADDRESS`.

## Step 2 — Add liquidity
- Add liquidity via your preferred router (Uniswap v2/v3)
- Exclude router + pair from fees/limits if desired (recommended)

## Step 3 — Enable trading (one-way)
Enable trading **after** liquidity is confirmed:
```js
await vibe.enableTrading();
```

## Admin delay schedule/execute (24h)
Sensitive actions are timelocked.

### Schedule fees (if changing from defaults)
```js
await vibe.scheduleFees(200, 200, 100);
```
Wait `ADMIN_DELAY`, then:
```js
await vibe.executeFees();
```

### Schedule limits (if changing from defaults)
```js
await vibe.scheduleLimits(maxTx, maxWallet, cooldown);
```
Wait `ADMIN_DELAY`, then:
```js
await vibe.executeLimits();
```

### Optional: relax limits after launch (no delay)
```js
await vibe.relaxLimits(fullSupply, fullSupply, 0);
```

## Owner / multisig plan
1) Deploy from EOA.
2) After launch stabilization, transfer ownership to multisig:
```js
await vibe.transferOwnership(multisigAddress);
```
3) Once multisig confirmed, freeze fees:
```js
await vibe.freezeFees();
```

## Post-launch checklist
- Verify contract on Etherscan
- Update token info (logo, website, socials)
- Publish token address on official channels
- (Optional) submit to token lists
