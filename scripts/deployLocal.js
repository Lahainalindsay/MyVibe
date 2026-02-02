/* eslint-disable no-console */
const hre = require("hardhat");

async function waitDeployed(contract) {
  if (contract.waitForDeployment) return contract.waitForDeployment();
  if (contract.deployed) return contract.deployed();
  return undefined;
}

async function getAddress(contract) {
  if (contract.getAddress) return contract.getAddress();
  return contract.address;
}

async function main() {
  const signers = await hre.ethers.getSigners();
  const deployer = signers[0];
  if (!deployer) throw new Error("No deployer signer available");

  const deployerAddr = await deployer.getAddress();
  console.log("🚀 Deployer:", deployerAddr);

  const dao = signers[1] ? await signers[1].getAddress() : deployerAddr;
  const staking = signers[2] ? await signers[2].getAddress() : deployerAddr;
  const fairLaunch = signers[3] ? await signers[3].getAddress() : deployerAddr;
  const influencer = signers[4] ? await signers[4].getAddress() : deployerAddr;

  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
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
  await waitDeployed(vibe);
  const vibeAddr = await getAddress(vibe);
  console.log("✅ VibeToken:", vibeAddr);

  await vibe.setTradingEnabled(true);
  await vibe.scheduleLimits(
    hre.ethers.parseUnits("1000000000", 18),
    hre.ethers.parseUnits("1000000000", 18),
    0
  );
  const delay = await vibe.ADMIN_DELAY();
  await hre.ethers.provider.send("evm_increaseTime", [Number(delay)]);
  await hre.ethers.provider.send("evm_mine", []);
  await vibe.executeLimits();

  const Renderer = await hre.ethers.getContractFactory("SigilArcanaOnChainRenderer");
  const renderer = await Renderer.deploy();
  await waitDeployed(renderer);
  const rendererAddr = await getAddress(renderer);
  console.log("✅ Renderer:", rendererAddr);

  const WhatsYourVibeNFT = await hre.ethers.getContractFactory("WhatsYourVibeNFT");
  const soul = await WhatsYourVibeNFT.deploy(rendererAddr, vibeAddr, deployerAddr);
  await waitDeployed(soul);
  const soulAddr = await getAddress(soul);
  console.log("✅ WhatsYourVibeNFT:", soulAddr);

  await vibe.setExcludedFromFees(soulAddr, true);
  await vibe.setExcludedFromLimits(soulAddr, true);

  await soul.setPrices(hre.ethers.parseEther("0.01"), hre.ethers.parseUnits("1000", 18));

  console.log("\n🎉 Local deployment complete");
  console.log("VIBE_ADDRESS=", vibeAddr);
  console.log("RENDERER_ADDRESS=", rendererAddr);
  console.log("VYX_ADDRESS=", soulAddr);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
