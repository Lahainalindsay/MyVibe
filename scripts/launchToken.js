// Usage: VIBE_TOKEN=0x... npx hardhat run scripts/launchToken.js --network sepolia
require("dotenv").config();

async function main() {
  const hre = require("hardhat");
  const { ethers } = hre;

  const tokenAddress = process.env.VIBE_TOKEN;
  if (!tokenAddress) throw new Error("Missing VIBE_TOKEN env var (address).");

  const token = await ethers.getContractAt("VibeToken", tokenAddress);
  const [deployer] = await ethers.getSigners();

  if (await token.tradingEnabled()) {
    throw new Error("Trading already enabled. Refusing to run.");
  }

  if (await token.paused()) {
    throw new Error("Token is paused. Unpause before launch.");
  }

  const daoWallet = await token.daoWallet();
  if (daoWallet === ethers.ZeroAddress) {
    throw new Error("DAO wallet is zero address. Set DAO wallet first.");
  }

  const decimals = await token.decimals();
  const totalSupply = await token.totalSupply();
  const maxTx = await token.maxTxAmount();
  const maxWallet = await token.maxWalletAmount();

  const pct = (x) => Number((x * 10000n) / totalSupply) / 100; // percent with 2 decimals
  const maxTxPct = pct(maxTx);
  const maxWalletPct = pct(maxWallet);

  const minMaxTxPct = process.env.MIN_MAXTX_PCT ? Number(process.env.MIN_MAXTX_PCT) : 0.1;
  const minMaxWalletPct = process.env.MIN_MAXWALLET_PCT ? Number(process.env.MIN_MAXWALLET_PCT) : 0.1;

  if (maxTxPct < minMaxTxPct) throw new Error(`maxTx too low (${maxTxPct}%).`);
  if (maxWalletPct < minMaxWalletPct) throw new Error(`maxWallet too low (${maxWalletPct}%).`);

  const burn = await token.burnRate();
  const dao = await token.daoRate();
  const refl = await token.reflectRate();
  const totalFee = burn + dao + refl;
  const maxTotalFee = await token.MAX_TOTAL_FEE();
  if (totalFee > maxTotalFee) {
    throw new Error(`Total fee too high (${Number(totalFee) / 100}%).`);
  }

  const router = process.env.ROUTER_ADDRESS || null;
  const pair = process.env.PAIR_ADDRESS || null;
  const requireFeeExclusion = process.env.REQUIRE_FEE_EXCLUSION === "1";

  if (router || pair) {
    console.log("\n--- AMM Exclusions ---");
  }

  if (router) {
    const routerExLimit = await token.excludedFromLimits(router);
    if (!routerExLimit) throw new Error("Router not excluded from limits.");
    if (requireFeeExclusion) {
      const routerExFee = await token.excludedFromFees(router);
      if (!routerExFee) throw new Error("Router not excluded from fees.");
    }
    console.log("Router excluded from limits:", true);
    if (requireFeeExclusion) console.log("Router excluded from fees:", true);
  }

  if (pair) {
    const pairExLimit = await token.excludedFromLimits(pair);
    if (!pairExLimit) throw new Error("Pair not excluded from limits.");
    if (requireFeeExclusion) {
      const pairExFee = await token.excludedFromFees(pair);
      if (!pairExFee) throw new Error("Pair not excluded from fees.");
    }
    console.log("Pair excluded from limits:", true);
    if (requireFeeExclusion) console.log("Pair excluded from fees:", true);
  }

  if (process.env.CHECK_LIQUIDITY === "1") {
    if (!pair) throw new Error("CHECK_LIQUIDITY requires PAIR_ADDRESS.");
    const pairAbi = ["function getReserves() external view returns (uint112,uint112,uint32)"]; // Uniswap V2-like
    const pairContract = await ethers.getContractAt(pairAbi, pair);
    const reserves = await pairContract.getReserves();
    if (reserves[0] === 0n || reserves[1] === 0n) {
      throw new Error("Pair reserves are zero. Liquidity not added.");
    }
    console.log("Liquidity check: OK");
  }

  console.log("\n=== Launch preflight OK ===");
  console.log("Deployer:", deployer.address);
  console.log("Token:", tokenAddress);
  console.log("maxTx%:", maxTxPct.toFixed(2), "maxWallet%:", maxWalletPct.toFixed(2));
  console.log("fees%:", (Number(totalFee) / 100).toFixed(2));

  console.log("\nEnabling trading (one-way)...");
  const tx = await token.enableTrading();
  await tx.wait();
  console.log("Trading enabled:", tx.hash);

  const relaxMaxTxPct = process.env.RELAX_MAXTX_PCT ? Number(process.env.RELAX_MAXTX_PCT) : null;
  const relaxMaxWalletPct = process.env.RELAX_MAXWALLET_PCT ? Number(process.env.RELAX_MAXWALLET_PCT) : null;
  const relaxCooldown = process.env.RELAX_COOLDOWN ? Number(process.env.RELAX_COOLDOWN) : null;

  if (relaxMaxTxPct !== null || relaxMaxWalletPct !== null || relaxCooldown !== null) {
    const newMaxTx = relaxMaxTxPct !== null
      ? (totalSupply * BigInt(Math.floor(relaxMaxTxPct * 100)) / 10000n)
      : maxTx;
    const newMaxWallet = relaxMaxWalletPct !== null
      ? (totalSupply * BigInt(Math.floor(relaxMaxWalletPct * 100)) / 10000n)
      : maxWallet;
    const newCooldown = relaxCooldown !== null ? BigInt(relaxCooldown) : await token.cooldownTime();

    console.log("\nCalling relaxLimits... (post-launch only)");
    const tx2 = await token.relaxLimits(newMaxTx, newMaxWallet, newCooldown);
    await tx2.wait();
    console.log("relaxLimits done:", tx2.hash);
  }

  if (process.env.FREEZE_FEES === "1") {
    console.log("\nFreezing fees...");
    const tx3 = await token.freezeFees();
    await tx3.wait();
    console.log("freezeFees done:", tx3.hash);
  }

  console.log("\nDone. Now run read script to confirm state:");
  console.log("  npx hardhat run scripts/readVibeToken.js --network <network>");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
