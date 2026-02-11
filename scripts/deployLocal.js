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
  const AUTO_LAUNCH = process.env.AUTO_LAUNCH === "1";
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

  await vibe.setExcludedFromFees(deployerAddr, true);
  await vibe.setExcludedFromFees(dao, true);
  await vibe.setExcludedFromFees(vibeAddr, true);
  for (const s of signers.slice(2, 10)) {
    await vibe.setExcludedFromFees(s.address, false);
  }
  console.log("✅ Local: only deployer/DAO/token are fee-exempt; others pay fees");

  if (AUTO_LAUNCH) {
    await vibe.setTradingEnabled(true);
    console.log("✅ Trading enabled (AUTO_LAUNCH=1)");
  } else {
    console.log("ℹ️ Trading left disabled (AUTO_LAUNCH=0). Run launch:token to enable.");
  }
  const totalSupply = await vibe.totalSupply();
  const maxTx2pct = (totalSupply * 2n) / 100n;
  const maxWallet2pct = (totalSupply * 2n) / 100n;
  console.log("ℹ️ Scheduling 2% limits:", maxTx2pct.toString(), maxWallet2pct.toString());
  await vibe.scheduleLimits(maxTx2pct, maxWallet2pct, 0);
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

  if (soulAddr && soulAddr !== hre.ethers.ZeroAddress) {
    const code = await hre.ethers.provider.getCode(soulAddr);
    if (code !== "0x") {
      await vibe.setExcludedFromFees(soulAddr, true);
      await vibe.setExcludedFromLimits(soulAddr, true);
      console.log("✅ Excluded contract from fees/limits:", soulAddr);
    } else {
      console.log("ℹ️ soulAddr is not a contract; not excluding:", soulAddr);
    }
  }

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
