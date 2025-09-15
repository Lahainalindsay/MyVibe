const hre = require("hardhat");

async function main() {
  const vibe = process.env.VIBE_ADDRESS;
  const renderer = process.env.RENDERER_ADDRESS;
  const soul = process.env.SOUL_ADDRESS;

  // Derive deployer address to use as a sensible default for constructor args
  const [deployer] = await hre.ethers.getSigners();
  const deployerAddress = (process.env.DEPLOYER_ADDRESS && process.env.DEPLOYER_ADDRESS.trim())
    || (deployer && (await deployer.getAddress()))
    || undefined;

  if (vibe) {
    const dao = process.env.DAO_ADDRESS || deployerAddress;
    const staking = process.env.STAKING_ADDRESS || deployerAddress;
    const fairLaunch = process.env.FAIRLAUNCH_ADDRESS || deployerAddress;
    const influencer = process.env.INFLUENCER_ADDRESS || deployerAddress;

    if (!dao || !staking || !fairLaunch || !influencer) {
      throw new Error("Missing constructor args for VibeToken. Provide DAO_ADDRESS, STAKING_ADDRESS, FAIRLAUNCH_ADDRESS, INFLUENCER_ADDRESS or set DEPLOYER_ADDRESS/PRIVATE_KEY.");
    }

    console.log("Verifying VibeToken with args:", [dao, staking, fairLaunch, influencer]);
    await hre.run("verify:verify", {
      address: vibe,
      constructorArguments: [dao, staking, fairLaunch, influencer],
    });
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
    const owner = process.env.NFT_OWNER_ADDRESS || deployerAddress;
    if (!process.env.RENDERER_ADDRESS || !process.env.VIBE_ADDRESS || !owner) {
      throw new Error("Missing constructor args for SoulArcanaNFT. Provide RENDERER_ADDRESS, VIBE_ADDRESS, and NFT_OWNER_ADDRESS or set DEPLOYER_ADDRESS/PRIVATE_KEY.");
    }

    console.log("Verifying SoulArcanaNFT with args:", [process.env.RENDERER_ADDRESS, process.env.VIBE_ADDRESS, owner]);
    await hre.run("verify:verify", {
      address: soul,
      constructorArguments: [
        process.env.RENDERER_ADDRESS,
        process.env.VIBE_ADDRESS,
        owner,
      ],
    });
  } else {
    console.log("SOUL_ADDRESS not set; skipping SoulArcanaNFT verification");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
