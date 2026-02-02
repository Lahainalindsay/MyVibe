// Usage: VIBE_TOKEN=0x... npx hardhat run scripts/readVibeToken.js --network sepolia
require("dotenv").config();

async function main() {
  const hre = require("hardhat");
  const { ethers } = hre;

  const tokenAddress = process.env.VIBE_TOKEN;
  if (!tokenAddress) throw new Error("Missing VIBE_TOKEN env var (address).");

  const token = await ethers.getContractAt("VibeToken", tokenAddress);

  const [
    name,
    symbol,
    decimals,
    totalSupply,
    owner,
  ] = await Promise.all([
    token.name(),
    token.symbol(),
    token.decimals(),
    token.totalSupply(),
    token.owner(),
  ]);

  const [
    tradingEnabled,
    launchTime,
    paused,
  ] = await Promise.all([
    token.tradingEnabled(),
    token.launchTime(),
    token.paused(),
  ]);

  const [
    maxTxAmount,
    maxWalletAmount,
    cooldownTime,
  ] = await Promise.all([
    token.maxTxAmount(),
    token.maxWalletAmount(),
    token.cooldownTime(),
  ]);

  const [
    feesEnabled,
    feesFrozen,
    burnRate,
    daoRate,
    reflectRate,
    daoWallet,
  ] = await Promise.all([
    token.feesEnabled(),
    token.feesFrozen(),
    token.burnRate(),
    token.daoRate(),
    token.reflectRate(),
    token.daoWallet(),
  ]);

  const totalFeeBps = burnRate + daoRate + reflectRate;

  const contractBalance = await token.balanceOf(tokenAddress);

  const fmt = (x) => ethers.formatUnits(x, decimals);
  const fmtPct = (bps) => `${Number(bps) / 100}%`;

  console.log("=== VibeToken On-Chain State ===");
  console.log("Address:", tokenAddress);
  console.log("Name/Symbol:", name, "/", symbol);
  console.log("Decimals:", decimals);
  console.log("Total Supply:", fmt(totalSupply));
  console.log("Owner:", owner);

  console.log("\n--- Trading ---");
  console.log("Trading Enabled:", tradingEnabled);
  console.log(
    "Launch Time:",
    Number(launchTime) === 0 ? "(not launched)" : new Date(Number(launchTime) * 1000).toISOString()
  );
  console.log("Paused:", paused);

  console.log("\n--- Limits ---");
  console.log("Max Tx:", fmt(maxTxAmount));
  console.log("Max Wallet:", fmt(maxWalletAmount));
  console.log("Cooldown (sec):", Number(cooldownTime));

  console.log("\n--- Fees ---");
  console.log("Fees Enabled:", feesEnabled);
  console.log("Fees Frozen:", feesFrozen);
  console.log("Burn Fee:", fmtPct(burnRate));
  console.log("DAO Fee:", fmtPct(daoRate));
  console.log("Reflection Fee:", fmtPct(reflectRate));
  console.log("Total Fee:", fmtPct(totalFeeBps));
  console.log("DAO Wallet:", daoWallet);

  console.log("\n--- Contract balance (reflection pool) ---");
  console.log("Token held by contract:", fmt(contractBalance));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
