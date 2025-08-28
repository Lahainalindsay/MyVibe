// scripts/deploySoulArcana.js
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Deploying SoulArcana contracts...");

  // Deploy SoulArcanaNFT
  const SoulArcanaNFT = await ethers.getContractFactory("SoulArcanaNFT");
  const soulArcanaNFT = await SoulArcanaNFT.deploy();
  await soulArcanaNFT.deployed();
  console.log("✨ SoulArcanaNFT deployed to:", soulArcanaNFT.address);

  // Deploy Renderer
  const Renderer = await ethers.getContractFactory("SigilArcanaOnChainRenderer");
  const renderer = await Renderer.deploy();
  await renderer.deployed();
  console.log("🎨 Renderer deployed to:", renderer.address);

  // Set the renderer inside SoulArcanaNFT
  const tx = await soulArcanaNFT.setRenderer(renderer.address);
  await tx.wait();
  console.log("🔗 Renderer linked to SoulArcanaNFT");

  console.log("✅ Deployment complete!");
  console.log("SoulArcanaNFT:", soulArcanaNFT.address);
  console.log("Renderer:", renderer.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
