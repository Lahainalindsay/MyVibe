const hre = require("hardhat");

async function main() {
  const vibe = process.env.VIBE_ADDRESS;
  const renderer = process.env.RENDERER_ADDRESS;
  const soul = process.env.SOUL_ADDRESS;

  if (vibe) {
    // VibeToken constructor takes FOUR addresses:
    // constructor(address _daoWallet, address staking, address fairLaunch, address influencer)
    await hre.run("verify:verify", {
      address: vibe,
      constructorArguments: [
        process.env.DAO_ADDRESS,
        process.env.STAKING_ADDRESS,
        process.env.FAIRLAUNCH_ADDRESS,
        process.env.INFLUENCER_ADDRESS,
      ],
    });
  }

  if (renderer) {
    await hre.run("verify:verify", {
      address: renderer,
      constructorArguments: [],
    });
  }

  if (soul) {
    await hre.run("verify:verify", {
      address: soul,
      constructorArguments: [
        process.env.RENDERER_ADDRESS,
        process.env.VIBE_ADDRESS,
        process.env.NFT_OWNER_ADDRESS,
      ],
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
