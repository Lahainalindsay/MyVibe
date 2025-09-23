/* eslint-disable no-console */
const hre = require("hardhat");

function env(name) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : undefined;
}

async function main() {
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error("No deployer signer available. Check PRIVATE_KEY in .env");

  const deployerAddr = await deployer.getAddress();
  console.log("🚀 Deployer:", deployerAddr);

  // Resolve auxiliary addresses: prefer env vars; fallback to additional signers; else deployer
  const dao = env("DAO_ADDRESS") || (signers[1] && (await signers[1].getAddress())) || deployerAddr;
  const staking = env("STAKING_ADDRESS") || (signers[2] && (await signers[2].getAddress())) || deployerAddr;
  const fairLaunch = env("FAIRLAUNCH_ADDRESS") || (signers[3] && (await signers[3].getAddress())) || deployerAddr;
  const influencer = env("INFLUENCER_ADDRESS") || (signers[4] && (await signers[4].getAddress())) || deployerAddr;

  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
  const vibe = await VibeToken.deploy(dao, staking, fairLaunch, influencer);
  await vibe.deployed?.();
  const vibeAddr = await vibe.getAddress?.() || vibe.address;
  console.log("✅ VibeToken:", vibeAddr);

  // Enable trading + loosen limits for testing
  await vibe.setTradingEnabled(true);
  await vibe.setLimits(
    hre.ethers.parseUnits("1000000000", 18), // maxTx ~ full supply
    hre.ethers.parseUnits("1000000000", 18), // maxWallet ~ full supply
    0 // cooldown
  );

  const Renderer = await hre.ethers.getContractFactory("SigilArcanaOnChainRenderer");
  const renderer = await Renderer.deploy();
  await renderer.deployed?.();
  const rendererAddr = await renderer.getAddress?.() || renderer.address;
  console.log("✅ Renderer:", rendererAddr);

  const WhatsYourVibeNFT = await hre.ethers.getContractFactory("WhatsYourVibeNFT");
  const soul = await WhatsYourVibeNFT.deploy(rendererAddr, vibeAddr, deployerAddr);
  await soul.deployed?.();
  const soulAddr = await soul.getAddress?.() || soul.address;
  console.log("✅ WhatsYourVibeNFT:", soulAddr);

  // Exclude NFT from fees/limits
  await vibe.setExcludedFromFees(soulAddr, true);
  await vibe.setExcludedFromLimits(soulAddr, true);

  // Set mint prices
  await soul.setPrices(hre.ethers.parseEther("0.01"), hre.ethers.parseUnits("1000", 18));

  console.log("\n🎉 Deployment complete");
  console.log("VIBE_ADDRESS=", vibeAddr);
  console.log("RENDERER_ADDRESS=", rendererAddr);
  console.log("WYV_ADDRESS=", soulAddr);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
