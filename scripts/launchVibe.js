/* eslint-disable no-console */
const hre = require("hardhat");

function env(name, def) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : def;
}

async function main() {
  const vibeAddr = env("VIBE_ADDRESS");
  if (!vibeAddr) throw new Error("VIBE_ADDRESS not set in environment");

  const [signer] = await hre.ethers.getSigners();
  if (!signer) throw new Error("No signer available. Check PRIVATE_KEY in .env");
  const from = await signer.getAddress();
  console.log("Network:", hre.network.name);
  console.log("From:", from);
  console.log("VibeToken:", vibeAddr);

  const vibe = await hre.ethers.getContractAt("VibeToken", vibeAddr, signer);

  // 1) Enable trading
  {
    const tx = await vibe.setTradingEnabled(true);
    console.log("setTradingEnabled tx:", tx.hash);
    await tx.wait();
    console.log("tradingEnabled:", await vibe.tradingEnabled());
  }

  // 2) Optional: set relaxed limits to full supply when VIBE_LIMITS=full
  const limitsMode = env("VIBE_LIMITS", "keep"); // keep | full
  if (limitsMode === "full") {
    const full = hre.ethers.parseUnits("1000000000", 18);
    const tx = await vibe.setLimits(full, full, 0);
    console.log("setLimits (full supply) tx:", tx.hash);
    await tx.wait();
  } else {
    console.log("Limits unchanged (set VIBE_LIMITS=full to relax)");
  }

  // 3) Optional: ensure fees enabled/disabled via VIBE_FEES_ENABLED=true|false
  const feesEnabled = env("VIBE_FEES_ENABLED");
  if (feesEnabled === "true" || feesEnabled === "false") {
    const enabled = feesEnabled === "true";
    const tx = await vibe.setFeesEnabled(enabled);
    console.log("setFeesEnabled(", enabled, ") tx:", tx.hash);
    await tx.wait();
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

