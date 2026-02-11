/* eslint-disable no-console */
const hre = require("hardhat");

function env(name) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : undefined;
}

function resolveAddress(hre, name, fallback) {
  const value = env(name);
  if (!value) return fallback;
  if (!hre.ethers.isAddress(value)) {
    console.warn(`⚠️ Invalid ${name} (${value}); using fallback ${fallback}`);
    return fallback;
  }
  return hre.ethers.getAddress(value);
}

async function waitForDeploymentCompat(contract) {
  if (typeof contract.waitForDeployment === "function") {
    await contract.waitForDeployment();
    return;
  }
  if (typeof contract.deployed === "function") {
    await contract.deployed();
  }
}

async function main() {
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error("No deployer signer available. Check PRIVATE_KEY in .env");
  const isLocal = ["hardhat", "localhost"].includes(hre.network.name);

  const deployerAddr = await deployer.getAddress();
  console.log("🚀 Deployer:", deployerAddr);

  // Resolve auxiliary addresses: prefer valid env vars; fallback to additional signers; else deployer
  const daoFallback = (signers[1] && (await signers[1].getAddress())) || deployerAddr;
  const stakingFallback = (signers[2] && (await signers[2].getAddress())) || deployerAddr;
  const fairLaunchFallback = (signers[3] && (await signers[3].getAddress())) || deployerAddr;
  const influencerFallback = (signers[4] && (await signers[4].getAddress())) || deployerAddr;

  const dao = resolveAddress(hre, "DAO_ADDRESS", daoFallback);
  const staking = resolveAddress(hre, "STAKING_ADDRESS", stakingFallback);
  const fairLaunch = resolveAddress(hre, "FAIRLAUNCH_ADDRESS", fairLaunchFallback);
  const influencer = resolveAddress(hre, "INFLUENCER_ADDRESS", influencerFallback);
  const nftOwner = resolveAddress(hre, "NFT_OWNER_ADDRESS", deployerAddr);

  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
  // Support multiple constructor signatures by inspecting inputs length
  const ctor = VibeToken.interface.fragments.find((f) => f.type === "constructor");
  const argc = (ctor && ctor.inputs && ctor.inputs.length) || 0;
  let vibe;
  if (argc >= 4) {
    vibe = await VibeToken.deploy(dao, staking, fairLaunch, influencer);
  } else if (argc === 2) {
    vibe = await VibeToken.deploy(dao, deployerAddr);
  } else if (argc === 1) {
    vibe = await VibeToken.deploy(dao);
  } else {
    vibe = await VibeToken.deploy();
  }
  await waitForDeploymentCompat(vibe);
  const vibeAddr = await vibe.getAddress?.() || vibe.address;
  console.log("✅ VibeToken:", vibeAddr);

  // For local testing only: enable trading + loosen limits
  if (isLocal) {
    await vibe.setTradingEnabled(true);
    await vibe.scheduleLimits(
      hre.ethers.parseUnits("1000000000", 18), // maxTx ~ full supply
      hre.ethers.parseUnits("1000000000", 18), // maxWallet ~ full supply
      0 // cooldown
    );
    const delay = await vibe.ADMIN_DELAY();
    await hre.ethers.provider.send("evm_increaseTime", [Number(delay)]);
    await hre.ethers.provider.send("evm_mine", []);
    await vibe.executeLimits();
  } else {
    console.log("ℹ️ Trading not enabled. Enable later with enableTrading().");
    await vibe.scheduleLimits(
      hre.ethers.parseUnits("1000000000", 18),
      hre.ethers.parseUnits("1000000000", 18),
      0
    );
    const pending = await vibe.pendingLimits();
    console.log("ℹ️ Limits scheduled; execute after ETA:", Number(pending.eta));
  }

  const Renderer = await hre.ethers.getContractFactory("SigilArcanaOnChainRenderer");
  const renderer = await Renderer.deploy();
  await waitForDeploymentCompat(renderer);
  const rendererAddr = await renderer.getAddress?.() || renderer.address;
  console.log("✅ Renderer:", rendererAddr);

  const WhatsYourVibeNFT = await hre.ethers.getContractFactory("WhatsYourVibeNFT");
  const soul = await WhatsYourVibeNFT.deploy(rendererAddr, vibeAddr, nftOwner);
  await waitForDeploymentCompat(soul);
  const soulAddr = await soul.getAddress?.() || soul.address;
  console.log("✅ WhatsYourVibeNFT:", soulAddr);

  // Exclude NFT from fees/limits
  if (soulAddr && soulAddr !== hre.ethers.ZeroAddress) {
    const code = await hre.ethers.provider.getCode(soulAddr);
    if (code !== "0x") {
      await vibe.setExcludedFromFees(soulAddr, true);
      console.log("✅ Excluded contract from fees:", soulAddr);
    } else {
      console.log("ℹ️ soulAddr is not a contract; not excluding:", soulAddr);
    }
  }
  await vibe.setExcludedFromLimits(soulAddr, true);

  // Set mint prices
  await soul.setPrices(hre.ethers.parseEther("0.01"), hre.ethers.parseUnits("1000", 18));

  console.log("\n🎉 Deployment complete");
  console.log("VIBE_ADDRESS=", vibeAddr);
  console.log("RENDERER_ADDRESS=", rendererAddr);
  console.log("VYX_ADDRESS=", soulAddr);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
