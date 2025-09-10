/* eslint-disable no-console */
const hre = require("hardhat");

async function main() {
  const [deployer, dao, staking, fairLaunch, influencer] = await hre.ethers.getSigners();
  console.log("🚀 Deployer:", deployer.address);

  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
  const vibe = await VibeToken.deploy(
    dao.address,
    staking.address,
    fairLaunch.address,
    influencer.address
  );
  await vibe.deployed();
  const vibeAddr = vibe.address;
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
  await renderer.deployed();
  const rendererAddr = renderer.address;
  console.log("✅ Renderer:", rendererAddr);

  const SoulArcanaNFT = await hre.ethers.getContractFactory("SoulArcanaNFT");
  const soul = await SoulArcanaNFT.deploy(rendererAddr, vibeAddr, deployer.address);
  await soul.deployed();
  const soulAddr = soul.address;
  console.log("✅ SoulArcanaNFT:", soulAddr);

  // Exclude NFT from fees/limits
  await vibe.setExcludedFromFees(soulAddr, true);
  await vibe.setExcludedFromLimits(soulAddr, true);

  // Set mint prices
  await soul.setPrices(
    hre.ethers.parseEther("0.01"),
    hre.ethers.parseUnits("1000", 18)
  );

  console.log("🎉 Deployment complete");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
