const hre = require("hardhat");

function env(name) {
  const v = process.env[name];
  return v && v.trim().length ? v.trim() : undefined;
}

function resolveAddress(name, fallback) {
  const value = env(name);
  if (!value) return fallback;
  if (!hre.ethers.isAddress(value)) {
    console.warn(`⚠️ Invalid ${name} (${value}); using fallback ${fallback}`);
    return fallback;
  }
  return hre.ethers.getAddress(value);
}

async function main() {
  const vibe = env("VIBE_ADDRESS");
  const renderer = env("RENDERER_ADDRESS");
  const soul = env("VYX_ADDRESS") || env("WYV_ADDRESS") || env("SOUL_ADDRESS");

  // Derive deployer address to use as a sensible default for constructor args
  const [deployer] = await hre.ethers.getSigners();
  const signerAddress = (deployer && (await deployer.getAddress())) || undefined;
  const deployerAddress = resolveAddress("DEPLOYER_ADDRESS", signerAddress);

  if (vibe) {
    // Inspect VibeToken constructor to match args dynamically
    const VibeToken = await hre.ethers.getContractFactory("VibeToken");
    const ctor = VibeToken.interface.fragments.find((f) => f.type === "constructor");
    const argc = (ctor && ctor.inputs && ctor.inputs.length) || 0;
    const dao = resolveAddress("DAO_ADDRESS", deployerAddress);
    const staking = resolveAddress("STAKING_ADDRESS", deployerAddress);
    const fairLaunch = resolveAddress("FAIRLAUNCH_ADDRESS", deployerAddress);
    const influencer = resolveAddress("INFLUENCER_ADDRESS", deployerAddress);
    let args = [];
    if (argc >= 4) args = [dao, staking, fairLaunch, influencer];
    else if (argc === 2) args = [dao, deployerAddress];
    else if (argc === 1) args = [dao];
    else args = [];

    console.log("Verifying VibeToken with args:", args);
    await hre.run("verify:verify", { address: vibe, constructorArguments: args });
  } else {
    console.log("VIBE_ADDRESS not set; skipping VibeToken verification");
  }

  if (renderer) {
    console.log("Verifying Renderer (no constructor args):", renderer);
    await hre.run("verify:verify", {
      address: renderer,
      constructorArguments: [],
    });
  } else {
    console.log("RENDERER_ADDRESS not set; skipping Renderer verification");
  }

  if (soul) {
    const owner = resolveAddress("NFT_OWNER_ADDRESS", deployerAddress);
    if (!renderer || !vibe || !owner) {
      throw new Error("Missing constructor args for WhatsYourVibeNFT. Provide RENDERER_ADDRESS, VIBE_ADDRESS, and NFT_OWNER_ADDRESS or set DEPLOYER_ADDRESS/PRIVATE_KEY.");
    }

    console.log("Verifying WhatsYourVibeNFT with args:", [renderer, vibe, owner]);
    await hre.run("verify:verify", {
      address: soul,
      constructorArguments: [
        renderer,
        vibe,
        owner,
      ],
    });
  } else {
    console.log("VYX_ADDRESS/WYV_ADDRESS/SOUL_ADDRESS not set; skipping WhatsYourVibeNFT verification");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
