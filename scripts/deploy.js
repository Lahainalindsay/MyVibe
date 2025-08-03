const hre = require("hardhat");

async function main() {
  const [deployer, dao, staking, fairLaunch, influencer] = await hre.ethers.getSigners();

  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
  const vibe = await VibeToken.deploy(
    dao.address,
    staking.address,
    fairLaunch.address,
    influencer.address,
    deployer.address
  );
  // Do NOT call await vibe.deployed()!

  console.log("✅ VibeToken deployed at:", vibe.target); // In ethers v6, use .target
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
