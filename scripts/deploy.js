/* eslint-disable no-console */
const hre = require("hardhat");

async function main() {
  const [deployer, dao, staking, fairLaunch, influencer, nftOwner] = await hre.ethers.getSigners();
  console.log("🚀 Deployer:", deployer.address);

  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
  const vibe = await VibeToken.deploy(
    dao.address,
    staking.address,
    fairLaunch.address,
    influencer.address,
    deployer.address
  );
  await vibe.waitForDeployment();
  const vibeAddr = await vibe.getAddress();
  console.log("✅ VibeToken:", vibeAddr);

  await (await vibe.setTradingEnabled(true)).wait();
  await (await vibe.setLimits(
    hre.ethers.utils.parseUnits("1000000000", 18),
    hre.ethers.utils.parseUnits("1000000000", 18),
    0
  )).wait();

  const Renderer = await hre.ethers.getContractFactory("SigilArcanaOnChainRenderer");
  const renderer = await Renderer.deploy();
  await renderer.waitForDeployment();
  const rendererAddr = await renderer.getAddress();
  console.log("✅ Renderer:", rendererAddr);

  const SoulArcanaNFT = await hre.ethers.getContractFactory("SoulArcanaNFT");
  const soul = await SoulArcanaNFT.deploy(
    rendererAddr,
    vibeAddr,
    nftOwner.address
  );
  await soul.waitForDeployment();
  const soulAddr = await soul.getAddress();
  console.log("✅ SoulArcanaNFT:", soulAddr);

  await (await vibe.setExcludedFromFees(soulAddr, true)).wait();
  await (await vibe.setExcludedFromLimits(soulAddr, true)).wait();

  await (await soul.connect(nftOwner).setPrices(
    hre.ethers.utils.parseEther("0.01"),
    hre.ethers.utils.parseUnits("1000", 18)
  )).wait();

  console.log("🎉 Deployment complete");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });