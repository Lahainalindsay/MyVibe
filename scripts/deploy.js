const hre = require("hardhat");

async function main() {
  const [deployer, dao, staking, fairLaunch, influencer] = await hre.ethers.getSigners();

  console.log("🚀 Deploying contracts with:", deployer.address);

  // 1. Deploy VibeToken
  const VibeToken = await hre.ethers.getContractFactory("VibeToken");
  const vibe = await VibeToken.deploy(
    dao.address,
    staking.address,
    fairLaunch.address,
    influencer.address,
    deployer.address
  );
  console.log("✅ VibeToken deployed at:", vibe.target);

  // 2. Deploy Renderer
  const Renderer = await hre.ethers.getContractFactory("SigilArcanaOnChainRenderer");
  const renderer = await Renderer.deploy();
  console.log("✅ Renderer deployed at:", renderer.target);

  // 3. Deploy SoulArcanaNFT (pass vibe + renderer)
  const SoulArcanaNFT = await hre.ethers.getContractFactory("SoulArcanaNFT");
  const soulArcana = await SoulArcanaNFT.deploy(
    vibe.target, // Vibe token address
    renderer.target, // Renderer address
    "ipfs://QmExample" // <-- Replace with your real base URI
  );
  console.log("✅ SoulArcanaNFT deployed at:", soulArcana.target);

  // 4. (Optional) Set NFT address inside VibeToken if needed
  // If VibeToken requires knowing the NFT contract, call a setter here:
  // await vibe.setSoulArcanaNFT(soulArcana.target);
  // console.log("🔗 Linked SoulArcanaNFT with VibeToken");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

